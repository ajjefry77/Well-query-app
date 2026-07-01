import { ref, computed, watch } from 'vue'
import { findWithinRadius, findNeighborPairs } from './useGeoUtils.js'
import {
  fetchVectorLayers,
  fetchLayerFields,
  fetchLayerFeatures,
  buildQueryableFields,
  featuresToRows,
} from './useGeoboxApi.js'

// ─── localStorage helpers ─────────────────────────────────
// نکته: ذخیره‌سازی در localStorage فقط برای «کوئری‌های ذخیره‌شده» انجام می‌شود.
// لایهٔ انتخاب‌شده و شرط‌های کوئری دیگر در localStorage نگه‌داری نمی‌شوند.
const LS_KEYS = {
  savedQueries: 'wqa:savedQueries',
  radiusKm:     'wqa:radiusKm',
}

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ─── ارزیابی شرط‌ها ──────────────────────────────────────

function evaluateCondition(row, { field, operator, value }) {
  const rowValue = row[field]
  if (rowValue === null || rowValue === undefined) return false
  switch (operator) {
    case '=':       return String(rowValue) === String(value)
    case '!=':      return String(rowValue) !== String(value)
    case '>':       return Number(rowValue) > Number(value)
    case '>=':      return Number(rowValue) >= Number(value)
    case '<':       return Number(rowValue) < Number(value)
    case '<=':      return Number(rowValue) <= Number(value)
    case 'contains':return String(rowValue).toLowerCase().includes(String(value).toLowerCase())
    default:        return false
  }
}

function evaluateGroup(row, conditions) {
  if (!conditions.length) return true
  let result = evaluateCondition(row, conditions[0])
  if (conditions[0].not) result = !result
  for (let i = 1; i < conditions.length; i++) {
    const cond = conditions[i]
    let r = evaluateCondition(row, cond)
    if (cond.not) r = !r
    result = cond.logic === 'OR' ? result || r : result && r
  }
  return result
}

// ─── Composable ───────────────────────────────────────────

export function useWellQuery() {
  const vectorLayers   = ref([])
  const activeLayers   = ref([])
  const selectedLayer  = computed(() => activeLayers.value[0] ?? null)

  const layerFieldsMap   = ref({})
  const layerFeaturesMap = ref({})

  const queryableFields = ref([])
  const allFeatures     = ref([])

  const loadingLayers   = ref(false)
  const loadingFields   = ref(false)
  const loadingFeatures = ref(false)
  const apiError        = ref(null)

  // ── بارگذاری لایه‌ها ──
  async function loadVectorLayers() {
    loadingLayers.value = true
    apiError.value = null
    try {
      vectorLayers.value = await fetchVectorLayers()
      // توجه: لایهٔ فعال دیگر از localStorage بازیابی نمی‌شود؛
      // انتخاب لایه فقط در حافظهٔ همان نشست (session) باقی می‌ماند.
    } catch (e) {
      apiError.value = e.message
    } finally {
      loadingLayers.value = false
    }
  }

  // ── بازسازی aggregated ──
  function rebuildAggregated() {
    const combined = []
    for (const layer of activeLayers.value) {
      const rows = layerFeaturesMap.value[layer.uuid] ?? []
      combined.push(...rows)
    }
    allFeatures.value = combined

    const fieldMap = {}
    for (const layer of activeLayers.value) {
      const fields = layerFieldsMap.value[layer.uuid] ?? []
      for (const f of fields) {
        if (!fieldMap[f.key]) fieldMap[f.key] = f
      }
    }
    queryableFields.value = Object.values(fieldMap)
  }

  // توجه: دیگر لایهٔ فعال و شرط‌های کوئری در localStorage ذخیره نمی‌شوند.

  // ── اضافه کردن یک لایه ──
  async function addLayer(layer) {
    if (activeLayers.value.find(l => l.uuid === layer.uuid)) return
    apiError.value = null
    const needFields   = !layerFieldsMap.value[layer.uuid]
    const needFeatures = !layerFeaturesMap.value[layer.uuid]
    if (needFields || needFeatures) {
      loadingFields.value   = true
      loadingFeatures.value = true
      try {
        await Promise.all([
          needFields ? (async () => {
            const fields = await fetchLayerFields(layer.uuid)
            layerFieldsMap.value[layer.uuid] = buildQueryableFields(fields)
          })() : Promise.resolve(),
          needFeatures ? (async () => {
            const data = await fetchLayerFeatures(layer.uuid, { pageSize: 200, limit: 200 })
            const raw = Array.isArray(data) ? data : (data.features ?? data.results ?? data.data ?? [])
            layerFeaturesMap.value[layer.uuid] = featuresToRows(raw).map(r => ({
              ...r,
              _layerUuid: layer.uuid,
              _layerName: layer.display_name || layer.name,
            }))
          })() : Promise.resolve(),
        ])
      } catch (e) {
        apiError.value = e.message
        return
      } finally {
        loadingFields.value   = false
        loadingFeatures.value = false
      }
    }
    activeLayers.value = [...activeLayers.value, layer]
    rebuildAggregated()
    ensureLayerConditions(layer.uuid)
  }

  // ── حذف یک لایه ──
  function removeLayer(uuid) {
    activeLayers.value = activeLayers.value.filter(l => l.uuid !== uuid)
    rebuildAggregated()
    delete layerConditions.value[uuid]
  }

  // ── تنظیم دسته‌ای لایه‌ها ──
  async function setActiveLayers(layers) {
    if (!layers.length) {
      activeLayers.value = []
      rebuildAggregated()
      return
    }
    apiError.value = null
    const needsLoad = layers.filter(l =>
      !layerFieldsMap.value[l.uuid] || !layerFeaturesMap.value[l.uuid]
    )
    if (needsLoad.length) {
      loadingFields.value   = true
      loadingFeatures.value = true
      try {
        await Promise.all(needsLoad.map(async (layer) => {
          if (!layerFieldsMap.value[layer.uuid]) {
            const fields = await fetchLayerFields(layer.uuid)
            layerFieldsMap.value[layer.uuid] = buildQueryableFields(fields)
          }
          if (!layerFeaturesMap.value[layer.uuid]) {
            const data = await fetchLayerFeatures(layer.uuid, { pageSize: 200, limit: 200 })
            const raw = Array.isArray(data) ? data : (data.features ?? data.results ?? data.data ?? [])
            layerFeaturesMap.value[layer.uuid] = featuresToRows(raw).map(r => ({
              ...r,
              _layerUuid: layer.uuid,
              _layerName: layer.display_name || layer.name,
            }))
          }
        }))
      } catch (e) {
        apiError.value = e.message
      } finally {
        loadingFields.value   = false
        loadingFeatures.value = false
      }
    }
    activeLayers.value = layers
    rebuildAggregated()

    for (const l of layers) ensureLayerConditions(l.uuid)
  }

  async function selectLayer(layer) {
    await setActiveLayers([layer])
  }

  // ── کوئری توصیفی ──
  const layerConditions = ref({})

  function ensureLayerConditions(uuid) {
    if (!layerConditions.value[uuid]) {
      const fields = layerFieldsMap.value[uuid] ?? []
      if (fields.length) {
        const first = fields[0]
        layerConditions.value[uuid] = [{
          field: first.key,
          operator: first.type === 'number' ? '>' : '=',
          value: '',
          logic: 'AND',
          not: false,
        }]
      } else {
        layerConditions.value[uuid] = []
      }
    }
  }

  function getLayerConditions(uuid) {
    ensureLayerConditions(uuid)
    return layerConditions.value[uuid]
  }

  function addLayerCondition(uuid) {
    ensureLayerConditions(uuid)
    const fields = layerFieldsMap.value[uuid] ?? []
    const first = fields[0]
    if (!first) return
    layerConditions.value[uuid].push({
      field: first.key,
      operator: first.type === 'number' ? '>' : '=',
      value: '',
      logic: 'AND',
      not: false,
    })
  }

  function removeLayerCondition(uuid, index) {
    if (!layerConditions.value[uuid]) return
    layerConditions.value[uuid].splice(index, 1)
  }

  function getLayerResultCount(uuid) {
    const rows = layerFeaturesMap.value[uuid] ?? []
    const conds = layerConditions.value[uuid] ?? []
    const active = conds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
    if (!active.length) return rows.length
    return rows.filter(row => evaluateGroup(row, active)).length
  }

  const attributeResults = computed(() => {
    if (!activeLayers.value.length) return allFeatures.value
    const results = []
    for (const layer of activeLayers.value) {
      const rows  = layerFeaturesMap.value[layer.uuid] ?? []
      const conds = layerConditions.value[layer.uuid] ?? []
      const active = conds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
      results.push(...(active.length ? rows.filter(row => evaluateGroup(row, active)) : rows))
    }
    return results
  })

  const hasAttributeFilter = computed(() =>
    activeLayers.value.some(layer => {
      const conds = layerConditions.value[layer.uuid] ?? []
      return conds.some(c => c.value !== '' && c.value !== null && c.value !== undefined)
    })
  )

  const hasSpatialFilter = computed(() => radiusCenter.value !== null)

  const combinedResults = computed(() => {
    const makeKey = r => `${r._layerUuid}::${r.id}`
    if (!hasAttributeFilter.value && !hasSpatialFilter.value) return allFeatures.value
    if (!hasSpatialFilter.value) return attributeResults.value
    if (!hasAttributeFilter.value) return radiusResults.value
    const spatialKeys = new Set(radiusResults.value.map(makeKey))
    return attributeResults.value.filter(r => spatialKeys.has(makeKey(r)))
  })

  const hasAnyFilter = computed(() => hasAttributeFilter.value || hasSpatialFilter.value)

  const conditions = computed(() => {
    const first = activeLayers.value[0]
    return first ? (layerConditions.value[first.uuid] ?? []) : []
  })

  function addCondition() {
    const first = activeLayers.value[0]
    if (first) addLayerCondition(first.uuid)
  }
  function removeCondition(index) {
    const first = activeLayers.value[0]
    if (first) removeLayerCondition(first.uuid, index)
  }

  // ── کوئری مکانی ──
  const radiusCenter  = ref(null)
  const radiusKm      = ref(lsGet(LS_KEYS.radiusKm, 3))
  const neighborField = ref('')
  const neighborValue = ref('')
  const neighborMaxKm = ref(2)

  watch(radiusKm, val => lsSet(LS_KEYS.radiusKm, val))

  const radiusResults = computed(() => {
    if (!radiusCenter.value) return []
    const center = radiusCenter.value
    const candidates = allFeatures.value.filter(f => {
      if (!f.lat || !f.lng) return false
      return center.id === undefined || f.id !== center.id
    })
    return findWithinRadius(candidates, center, radiusKm.value)
  })

  const neighborResults = computed(() => {
    if (!neighborField.value) return []
    const candidates = allFeatures.value.filter(f => {
      if (!f.lat || !f.lng) return false
      return !neighborValue.value || String(f[neighborField.value]) === String(neighborValue.value)
    })
    return findNeighborPairs(candidates, neighborMaxKm.value)
  })

  // ── کوئری‌های ذخیره‌شده ──
  const savedQueries = ref(lsGet(LS_KEYS.savedQueries, []))

  watch(savedQueries, val => lsSet(LS_KEYS.savedQueries, val), { deep: true })

  function saveCurrentQuery(name, layerUuid) {
    const uuid = layerUuid ?? selectedLayer.value?.uuid
    if (!uuid) return
    const layer = activeLayers.value.find(l => l.uuid === uuid) ?? vectorLayers.value.find(l => l.uuid === uuid)
    const conds = layerConditions.value[uuid] ?? []
    savedQueries.value.push({
      id: Date.now(),
      name,
      type: 'attribute',
      layerUuid: uuid,
      layerName: layer?.display_name || layer?.name,
      conditions: JSON.parse(JSON.stringify(conds)),
    })
  }

  // وقتی کاربر روی یک کوئری ذخیره‌شده کلیک می‌کند:
  // ۱) لایهٔ مرتبط با آن کوئری به مجموعه لایه‌های فعال اضافه می‌شود (بدون حذف لایه‌های دیگر)
  // ۲) شرط‌های همان کوئری روی همان لایه اعمال می‌شود
  // به این ترتیب اگر چند کوئری برای چند لایهٔ مختلف بارگذاری شوند، همه با هم روی نقشه باقی می‌مانند.
  async function loadSavedQuery(query) {
    const uuid = query.layerUuid
    if (!uuid) return null

    let layer = activeLayers.value.find(l => l.uuid === uuid)
    if (!layer) {
      layer = vectorLayers.value.find(l => l.uuid === uuid)
      if (!layer) return null
      await addLayer(layer)
    }

    layerConditions.value[uuid] = JSON.parse(JSON.stringify(query.conditions ?? []))
    return uuid
  }

  function deleteSavedQuery(id) {
    savedQueries.value = savedQueries.value.filter(q => q.id !== id)
  }

  // ── پاک کردن همه داده‌های ذخیره‌شده ──
  function clearAllLocalData() {
    // پاک کردن localStorage (فقط کوئری‌های ذخیره‌شده و تنظیم شعاع در localStorage بودند)
    Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key))
    // ریست state بدون reload
    savedQueries.value    = []
    activeLayers.value    = []
    layerConditions.value = {}
    radiusKm.value        = 3
    radiusCenter.value    = null
    rebuildAggregated()
  }

  return {
    vectorLayers, activeLayers, selectedLayer,
    layerFieldsMap, layerFeaturesMap,
    queryableFields,
    loadingLayers, loadingFields, loadingFeatures, apiError,
    loadVectorLayers,
    addLayer, removeLayer, setActiveLayers,
    selectLayer,
    allWells: allFeatures,
    conditions, attributeResults, combinedResults, hasAnyFilter, hasAttributeFilter, hasSpatialFilter,
    addCondition, removeCondition,
    layerConditions,
    getLayerConditions, addLayerCondition, removeLayerCondition, getLayerResultCount,
    radiusCenter, radiusKm, radiusResults,
    neighborField, neighborValue, neighborMaxKm, neighborResults,
    savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
    clearAllLocalData,
  }
}
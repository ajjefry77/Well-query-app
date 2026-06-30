import { ref, computed, reactive, triggerRef, watch } from 'vue'
import { findWithinRadius, findNeighborPairs } from './useGeoUtils.js'
import {
  fetchVectorLayers,
  fetchLayerFields,
  fetchLayerFeatures,
  buildQueryableFields,
  featuresToRows,
} from './useGeoboxApi.js'

// ─── ارزیابی شرط‌ها ──────────────────────────────────────

function evaluateCondition(row, { field, operator, value }) {
  const rowValue = row[field]
  if (rowValue === null || rowValue === undefined) return false
  switch (operator) {
    case '=':  return String(rowValue) === String(value)
    case '!=': return String(rowValue) !== String(value)
    case '>':  return Number(rowValue) > Number(value)
    case '>=': return Number(rowValue) >= Number(value)
    case '<':  return Number(rowValue) < Number(value)
    case '<=': return Number(rowValue) <= Number(value)
    case 'contains': return String(rowValue).toLowerCase().includes(String(value).toLowerCase())
    default:   return false
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
  const vectorLayers    = ref([])
  // لایه‌های فعال (چند لایه)
  const activeLayers    = ref([])
  // برای سازگاری با بقیه کد، selectedLayer همیشه اولین لایه فعال است
  const selectedLayer   = computed(() => activeLayers.value[0] ?? null)

  // فیلدها و featureها به‌صورت map بر اساس uuid لایه ذخیره می‌شوند
  const layerFieldsMap    = ref({})   // uuid -> fields[]
  const layerFeaturesMap  = ref({})   // uuid -> rows[]

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
    } catch (e) {
      apiError.value = e.message
    } finally {
      loadingLayers.value = false
    }
  }

  // ── بازسازی allFeatures و queryableFields از لایه‌های فعال ──
  function rebuildAggregated() {
    // ترکیب همه featureها
    const combined = []
    for (const layer of activeLayers.value) {
      const rows = layerFeaturesMap.value[layer.uuid] ?? []
      combined.push(...rows)
    }
    allFeatures.value = combined

    // ترکیب فیلدها (بدون تکرار بر اساس key)
    const fieldMap = {}
    for (const layer of activeLayers.value) {
      const fields = layerFieldsMap.value[layer.uuid] ?? []
      for (const f of fields) {
        if (!fieldMap[f.key]) fieldMap[f.key] = f
      }
    }
    queryableFields.value = Object.values(fieldMap)
  }

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
  }

  // ── تنظیم دسته‌ای لایه‌ها (از مدال) ──
  async function setActiveLayers(layers) {
    if (!layers.length) {
      activeLayers.value = []
      rebuildAggregated()
      return
    }

    apiError.value = null
    const newLayers = layers.filter(l => !activeLayers.value.find(al => al.uuid === l.uuid))
    const needsLoad = newLayers.filter(l =>
      !layerFieldsMap.value[l.uuid] || !layerFeaturesMap.value[l.uuid]
    )

    if (needsLoad.length) {
      loadingFields.value = true
      loadingFeatures.value = true
      try {
        // همه لایه‌ها را موازی لود کن
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
        loadingFields.value = false
        loadingFeatures.value = false
      }
    }

    activeLayers.value = layers
    rebuildAggregated()
    for (const l of layers) ensureLayerConditions(l.uuid)
  }

  // ── selectLayer (برای سازگاری با کدهای قدیمی) ──
  async function selectLayer(layer) {
    await setActiveLayers([layer])
  }

  // ── کوئری توصیفی (per-layer) ──
  const layerConditions = reactive({})  // uuid -> conditions[]

  function ensureLayerConditions(uuid) {
    if (!layerConditions[uuid]) {
      const fields = layerFieldsMap.value[uuid] ?? []
      if (fields.length) {
        const first = fields[0]
        layerConditions[uuid] = [{ field: first.key, operator: first.type === 'number' ? '>' : '=', value: '', logic: 'AND', not: false }]
      } else {
        layerConditions[uuid] = []
      }
    }
  }

  function getLayerConditions(uuid) {
    ensureLayerConditions(uuid)
    return layerConditions[uuid]
  }

  function addLayerCondition(uuid) {
    ensureLayerConditions(uuid)
    const fields = layerFieldsMap.value[uuid] ?? []
    const first = fields[0]
    if (!first) return
    layerConditions[uuid].push({ field: first.key, operator: first.type === 'number' ? '>' : '=', value: '', logic: 'AND', not: false })
  }

  function removeLayerCondition(uuid, index) {
    if (!layerConditions[uuid]) return
    layerConditions[uuid].splice(index, 1)
  }

  function getLayerResultCount(uuid) {
    const rows = layerFeaturesMap.value[uuid] ?? []
    const conds = layerConditions[uuid] ?? []
    const active = conds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
    if (!active.length) return rows.length
    return rows.filter(row => evaluateGroup(row, active)).length
  }

  // نتایج فیلتر‌شده هر لایه به‌صورت مستقل
  // اگه لایه کوئری فعال داره → فقط نتایج کوئری
  // اگه نداره → همه عارضه‌هاش (بدون فیلتر)
  const attributeResults = computed(() => {
    if (!activeLayers.value.length) return allFeatures.value
    const results = []
    for (const layer of activeLayers.value) {
      const rows = layerFeaturesMap.value[layer.uuid] ?? []
      const conds = layerConditions[layer.uuid] ?? []
      const active = conds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
      // هر لایه مستقل فیلتر میشه — اگه کوئری نداره همه عارضه‌هاش بیان
      results.push(...(active.length ? rows.filter(row => evaluateGroup(row, active)) : rows))
    }
    return results
  })

  // آیا حداقل یه لایه کوئری توصیفی فعال داره؟
  const hasAttributeFilter = computed(() =>
    activeLayers.value.some(layer => {
      const conds = layerConditions[layer.uuid] ?? []
      return conds.some(c => c.value !== '' && c.value !== null && c.value !== undefined)
    })
  )

  // آیا کوئری مکانی فعال داره؟
  const hasSpatialFilter = computed(() =>
    radiusCenter.value !== null
  )

  // نتایج ترکیبی: هر لایه مستقلاً فیلتر میشه، بعد مکانی روی کل اعمال میشه
  const combinedResults = computed(() => {
    const makeKey = r => `${r._layerUuid}::${r.id}`

    // بدون هیچ فیلتری: همه عارضه‌ها
    if (!hasAttributeFilter.value && !hasSpatialFilter.value) {
      return allFeatures.value
    }
    // فقط توصیفی: نتایج per-layer (هر لایه مستقل)
    if (!hasSpatialFilter.value) {
      return attributeResults.value
    }
    // فقط مکانی
    if (!hasAttributeFilter.value) {
      return radiusResults.value
    }
    // هر دو فعال: intersection مکانی روی نتایج توصیفی per-layer
    const spatialKeys = new Set(radiusResults.value.map(makeKey))
    return attributeResults.value.filter(r => spatialKeys.has(makeKey(r)))
  })

  // آیا اصلاً فیلتری فعاله؟
  const hasAnyFilter = computed(() =>
    hasAttributeFilter.value || hasSpatialFilter.value
  )

  // alias برای سازگاری (اولین لایه فعال)
  const conditions = computed(() => {
    const first = activeLayers.value[0]
    return first ? (layerConditions[first.uuid] ?? []) : []
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
  const radiusKm      = ref(3)
  const neighborField = ref('')
  const neighborValue = ref('')
  const neighborMaxKm = ref(2)

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
  const savedQueries = ref([])

  function saveCurrentQuery(name) {
    if (!activeLayers.value.length) return
    savedQueries.value.push({
      id: Date.now(),
      name,
      type: 'attribute',
      layerUuid: selectedLayer.value?.uuid,
      layerName: selectedLayer.value?.display_name || selectedLayer.value?.name,
      conditions: JSON.parse(JSON.stringify(conditions.value)),
    })
  }

  function loadSavedQuery(query) {
    conditions.value = JSON.parse(JSON.stringify(query.conditions))
  }

  function deleteSavedQuery(id) {
    savedQueries.value = savedQueries.value.filter(q => q.id !== id)
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
    conditions, attributeResults, combinedResults, hasAnyFilter, hasAttributeFilter, hasSpatialFilter, addCondition, removeCondition,
    layerConditions,
    getLayerConditions, addLayerCondition, removeLayerCondition, getLayerResultCount,
    radiusCenter, radiusKm, radiusResults,
    neighborField, neighborValue, neighborMaxKm, neighborResults,
    savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
  }
}
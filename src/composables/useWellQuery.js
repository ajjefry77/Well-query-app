import { ref, computed } from 'vue'
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
    // اگر قبلاً بارگذاری شده، فقط به activeLayers اضافه کن
    if (activeLayers.value.find(l => l.uuid === layer.uuid)) return

    apiError.value = null

    // بارگذاری فیلدها (اگر قبلاً نگرفتیم)
    if (!layerFieldsMap.value[layer.uuid]) {
      loadingFields.value = true
      try {
        const fields = await fetchLayerFields(layer.uuid)
        layerFieldsMap.value[layer.uuid] = buildQueryableFields(fields)
      } catch (e) {
        apiError.value = e.message
        loadingFields.value = false
        return
      } finally {
        loadingFields.value = false
      }
    }

    // بارگذاری featureها (اگر قبلاً نگرفتیم)
    if (!layerFeaturesMap.value[layer.uuid]) {
      loadingFeatures.value = true
      try {
        const data = await fetchLayerFeatures(layer.uuid, { pageSize: 200, limit: 200 })
        const raw = Array.isArray(data) ? data : (data.features ?? data.results ?? data.data ?? [])
        layerFeaturesMap.value[layer.uuid] = featuresToRows(raw).map(r => ({
          ...r,
          _layerUuid: layer.uuid,
          _layerName: layer.display_name || layer.name,
        }))
      } catch (e) {
        apiError.value = e.message
        loadingFeatures.value = false
        return
      } finally {
        loadingFeatures.value = false
      }
    }

    activeLayers.value = [...activeLayers.value, layer]
    rebuildAggregated()

    // اگر هنوز شرطی نداریم، یه شرط اولیه بساز
    if (!conditions.value.length && queryableFields.value.length) {
      const first = queryableFields.value[0]
      conditions.value = [{ field: first.key, operator: first.type === 'number' ? '>' : '=', value: '', logic: 'AND', not: false }]
    }
  }

  // ── حذف یک لایه ──
  function removeLayer(uuid) {
    activeLayers.value = activeLayers.value.filter(l => l.uuid !== uuid)
    rebuildAggregated()
  }

  // ── تنظیم دسته‌ای لایه‌ها (از مدال) ──
  async function setActiveLayers(layers) {
    // لایه‌های جدید را بارگذاری کن
    for (const layer of layers) {
      if (!activeLayers.value.find(l => l.uuid === layer.uuid)) {
        // اضافه نکن به activeLayers هنوز؛ بعد از لود همه اضافه می‌کنیم
        apiError.value = null

        if (!layerFieldsMap.value[layer.uuid]) {
          loadingFields.value = true
          try {
            const fields = await fetchLayerFields(layer.uuid)
            layerFieldsMap.value[layer.uuid] = buildQueryableFields(fields)
          } catch (e) {
            apiError.value = e.message
          } finally {
            loadingFields.value = false
          }
        }

        if (!layerFeaturesMap.value[layer.uuid]) {
          loadingFeatures.value = true
          try {
            const data = await fetchLayerFeatures(layer.uuid, { pageSize: 200, limit: 200 })
            const raw = Array.isArray(data) ? data : (data.features ?? data.results ?? data.data ?? [])
            layerFeaturesMap.value[layer.uuid] = featuresToRows(raw).map(r => ({
              ...r,
              _layerUuid: layer.uuid,
              _layerName: layer.display_name || layer.name,
            }))
          } catch (e) {
            apiError.value = e.message
          } finally {
            loadingFeatures.value = false
          }
        }
      }
    }

    activeLayers.value = layers
    rebuildAggregated()

    if (!conditions.value.length && queryableFields.value.length) {
      const first = queryableFields.value[0]
      conditions.value = [{ field: first.key, operator: first.type === 'number' ? '>' : '=', value: '', logic: 'AND', not: false }]
    }
  }

  // ── selectLayer (برای سازگاری با کدهای قدیمی) ──
  async function selectLayer(layer) {
    await setActiveLayers([layer])
  }

  // ── کوئری توصیفی ──
  const conditions = ref([])

  // شرط‌های هر لایه به صورت جداگانه
  const layerConditions = ref({})  // uuid -> conditions[]

  function getLayerConditions(uuid) {
    if (!layerConditions.value[uuid]) {
      const fields = layerFieldsMap.value[uuid] ?? []
      if (fields.length) {
        const first = fields[0]
        layerConditions.value[uuid] = [{ field: first.key, operator: first.type === 'number' ? '>' : '=', value: '', logic: 'AND', not: false }]
      } else {
        layerConditions.value[uuid] = []
      }
    }
    return layerConditions.value[uuid]
  }

  function setLayerConditions(uuid, conds) {
    layerConditions.value[uuid] = conds
  }

  const attributeResults = computed(() => {
    // اگر هیچ لایه‌ای فعال نیست، همه features را برگردان
    if (!activeLayers.value.length) return allFeatures.value

    const results = []
    for (const layer of activeLayers.value) {
      const rows = layerFeaturesMap.value[layer.uuid] ?? []
      const conds = layerConditions.value[layer.uuid] ?? []
      const active = conds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)

      if (!active.length) {
        results.push(...rows)
      } else {
        results.push(...rows.filter(row => evaluateGroup(row, active)))
      }
    }
    return results
  })

  function addCondition() {
    const first = queryableFields.value[0]
    conditions.value.push({ field: first?.key ?? '', operator: '=', value: '', logic: 'AND', not: false })
  }

  function removeCondition(index) {
    conditions.value.splice(index, 1)
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
    selectLayer,                             // alias برای سازگاری
    allWells: allFeatures,
    conditions, attributeResults, addCondition, removeCondition,
    layerConditions, getLayerConditions, setLayerConditions,
    radiusCenter, radiusKm, radiusResults,
    neighborField, neighborValue, neighborMaxKm, neighborResults,
    savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
  }
}

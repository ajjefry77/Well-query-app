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
  const vectorLayers   = ref([])
  const selectedLayer  = ref(null)
  const layerFields    = ref([])
  const queryableFields = ref([])
  const allFeatures    = ref([])

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

  // ── انتخاب لایه ──
  async function selectLayer(layer) {
    selectedLayer.value  = layer
    layerFields.value    = []
    queryableFields.value = []
    allFeatures.value    = []
    conditions.value     = []
    apiError.value       = null

    loadingFields.value = true
    try {
      const fields = await fetchLayerFields(layer.uuid)
      layerFields.value    = fields
      queryableFields.value = buildQueryableFields(fields)
      if (queryableFields.value.length) {
        const first = queryableFields.value[0]
        conditions.value = [{ field: first.key, operator: first.type === 'number' ? '>' : '=', value: '', logic: 'AND', not: false }]
      }
    } catch (e) {
      apiError.value = e.message
    } finally {
      loadingFields.value = false
    }

    loadingFeatures.value = true
    try {
      const data = await fetchLayerFeatures(layer.uuid, { pageSize: 200, limit: 200 })
      const raw = Array.isArray(data) ? data : (data.features ?? data.results ?? data.data ?? [])
      allFeatures.value = featuresToRows(raw)
    } catch (e) {
      apiError.value = e.message
    } finally {
      loadingFeatures.value = false
    }
  }

  // ── کوئری توصیفی ──
  const conditions = ref([])

  const attributeResults = computed(() => {
    const active = conditions.value.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
    if (!active.length) return allFeatures.value
    return allFeatures.value.filter(row => evaluateGroup(row, active))
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
    if (!selectedLayer.value) return
    savedQueries.value.push({
      id: Date.now(),
      name,
      type: 'attribute',
      layerUuid: selectedLayer.value.uuid,
      layerName: selectedLayer.value.display_name || selectedLayer.value.name,
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
    vectorLayers, selectedLayer, layerFields, queryableFields,
    loadingLayers, loadingFields, loadingFeatures, apiError,
    loadVectorLayers, selectLayer,
    allWells: allFeatures,   // نام alias برای سازگاری با template
    conditions, attributeResults, addCondition, removeCondition,
    radiusCenter, radiusKm, radiusResults,
    neighborField, neighborValue, neighborMaxKm, neighborResults,
    savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
  }
}

import { ref, computed, watch } from 'vue'
import { findWithinRadius } from './useGeoUtils.js'
import {
  fetchVectorLayers,
  fetchLayerFields,
  fetchAllFeatures,
  buildQueryableFields,
  featuresToRows,
} from './useGeoboxApi.js'

// ─── localStorage helpers ─────────────────────────────────
// نکته: ذخیره‌سازی در localStorage فقط برای «کوئری‌های ذخیره‌شده» انجام می‌شود.
// لایهٔ انتخاب‌شده و شرط‌های کوئری دیگر در localStorage نگه‌داری نمی‌شوند.
const LS_KEYS = {
  savedQueries: 'wqa:savedQueries',
}
// کلیدهای قدیمی شعاع که دیگر ذخیره نمی‌شوند؛ با رفرش باید به دیفالت برگردد
const LEGACY_RADIUS_KEYS = ['wqa:radiusKm', 'wqa:radiusUnit']

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
// اولویت استاندارد: AND قبل از OR (مثل SQL)
// شرط‌ها به بخش‌های OR تقسیم می‌شوند و در هر بخش همه با AND ترکیب می‌شوند.

function evaluateCondition(row, { field, operator, value }) {
  const rowValue = row[field]
  if (rowValue === null || rowValue === undefined) return false
  const v = typeof value === 'string' ? value.trim() : value
  switch (operator) {
    case '=':       return String(rowValue) === String(v)
    case '!=':      return String(rowValue) !== String(v)
    case '>':
    case '>=':
    case '<':
    case '<=': {
      const a = Number(rowValue), b = Number(v)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return false
      if (operator === '>') return a > b
      if (operator === '>=') return a >= b
      if (operator === '<') return a < b
      return a <= b
    }
    case 'contains':return String(rowValue).toLowerCase().includes(String(v ?? '').toLowerCase())
    default:        return false
  }
}

function evaluateGroup(row, conditions) {
  if (!conditions.length) return true
  const segments = [[]]
  for (const cond of conditions) {
    if (cond.logic === 'OR' && segments[segments.length - 1].length) {
      segments.push([])
    }
    segments[segments.length - 1].push(cond)
  }
  return segments.some(seg =>
    seg.every(cond => {
      let r = evaluateCondition(row, cond)
      return cond.not ? !r : r
    })
  )
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

  // ── بارگذاری فیلدها و عوارض یک لایه (با صفحه‌بندی کامل) ──
  // فیلدها و عوارض مستقل‌اند → موازی گرفته می‌شوند
  const inFlight = new Map()
  async function loadLayerData(layer, opts = {}) {
    const needFields = !layerFieldsMap.value[layer.uuid]
    const needFeatures = !layerFeaturesMap.value[layer.uuid]
    if (!needFields && !needFeatures) return
    inFlight.get(layer.uuid)?.abort()
    const ctrl = new AbortController()
    inFlight.set(layer.uuid, ctrl)
    const signal = opts.signal ?? ctrl.signal
    try {
      const [fields, raw] = await Promise.all([
        needFields ? fetchLayerFields(layer.uuid, { signal }) : null,
        needFeatures ? fetchAllFeatures(layer.uuid, { signal }) : null,
      ])
      if (signal.aborted) return
      if (needFields) {
        layerFieldsMap.value[layer.uuid] = buildQueryableFields(Array.isArray(fields) ? fields : (fields?.fields ?? fields?.results ?? []))
      }
      if (needFeatures) {
        layerFeaturesMap.value[layer.uuid] = featuresToRows(raw).map(r => ({
          ...r,
          _layerUuid: layer.uuid,
          _layerName: layer.display_name || layer.name,
        }))
      }
    } finally {
      if (inFlight.get(layer.uuid) === ctrl) inFlight.delete(layer.uuid)
    }
  }

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
    const needData = !layerFieldsMap.value[layer.uuid] || !layerFeaturesMap.value[layer.uuid]
    if (needData) {
      loadingFields.value   = true
      loadingFeatures.value = true
      try {
        await loadLayerData(layer)
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
    inFlight.get(uuid)?.abort()
    inFlight.delete(uuid)
    activeLayers.value = activeLayers.value.filter(l => l.uuid !== uuid)
    delete layerFeaturesMap.value[uuid]
    delete layerFieldsMap.value[uuid]
    rebuildAggregated()
    delete layerConditions.value[uuid]
  }

  // ── تنظیم دسته‌ای لایه‌ها ──
  async function setActiveLayers(layers) {
    if (!layers.length) {
      for (const [, c] of inFlight) c.abort()
      inFlight.clear()
      activeLayers.value = []
      rebuildAggregated()
      return
    }
    apiError.value = null
    const needsLoad = layers.filter(l =>
      !layerFieldsMap.value[l.uuid] || !layerFeaturesMap.value[l.uuid]
    )
    const failed = new Set()
    if (needsLoad.length) {
      loadingFields.value   = true
      loadingFeatures.value = true
      try {
        const results = await Promise.allSettled(needsLoad.map(loadLayerData))
        results.forEach((r, i) => {
          if (r.status === 'rejected' && r.reason?.name !== 'AbortError') {
            failed.add(needsLoad[i].uuid)
          }
        })
        if (failed.size) {
          apiError.value = `بارگذاری ${failed.size} لایه ناموفق بود و نادیده گرفته شد.`
        }
      } finally {
        loadingFields.value   = false
        loadingFeatures.value = false
      }
    }
    const okLayers = layers.filter(l => !failed.has(l.uuid))
    activeLayers.value = okLayers
    rebuildAggregated()

    for (const l of okLayers) ensureLayerConditions(l.uuid)
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

  // ── کوئری مکانی (فقط کیلومتر، بدون سقف) ──
  // شعاع عمداً در localStorage ذخیره نمی‌شود تا با رفرش صفحه به دیفالت برگردد
  const DEFAULT_RADIUS_KM = 3
  const radiusCenter  = ref(null)
  const radiusKm      = ref(DEFAULT_RADIUS_KM)
  // پاک‌سازی مقادیر قدیمی ذخیره‌شده (نسخه‌های قبلی) تا حتماً دیفالت اعمال شود
  try { LEGACY_RADIUS_KEYS.forEach(k => localStorage.removeItem(k)) } catch {}

  const radiusResults = computed(() => {
    if (!radiusCenter.value) return []
    const center = radiusCenter.value
    const rKm = Number(radiusKm.value)
    if (!Number.isFinite(rKm) || rKm <= 0) return []
    const centerKey = center._layerUuid ? `${center._layerUuid}::${center.id}` : null
    const candidates = allFeatures.value.filter(f => {
      if (!Number.isFinite(+f.lat) || !Number.isFinite(+f.lng)) return false
      if (centerKey) return `${f._layerUuid}::${f.id}` !== centerKey
      return center.id === undefined || String(f.id) !== String(center.id)
    })
    const clampedKm = Math.min(rKm, 20000)
    return findWithinRadius(candidates, center, clampedKm)
  })

  // ── کوئری‌های ذخیره‌شده ──
  const rawSaved = lsGet(LS_KEYS.savedQueries, [])
  const savedQueries = ref(Array.isArray(rawSaved) ? rawSaved.filter(q => q && typeof q.layerUuid === 'string' && Array.isArray(q.conditions)) : [])

  watch(savedQueries, val => lsSet(LS_KEYS.savedQueries, val), { deep: true })

  function saveCurrentQuery(name, layerUuid) {
    const uuid = layerUuid ?? selectedLayer.value?.uuid
    if (!uuid) return
    const cleanName = String(name ?? '').trim().slice(0, 120) || 'بدون نام'
    const layer = activeLayers.value.find(l => l.uuid === uuid) ?? vectorLayers.value.find(l => l.uuid === uuid)
    const conds = layerConditions.value[uuid] ?? []
    savedQueries.value.push({
      id: crypto.randomUUID(),
      name: cleanName,
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
    const uuid = query?.layerUuid
    if (!uuid || typeof uuid !== 'string') return null
    const safeConds = Array.isArray(query.conditions) ? query.conditions.filter(c => c && typeof c.field === 'string') : []

    let layer = activeLayers.value.find(l => l.uuid === uuid)
    if (!layer) {
      layer = vectorLayers.value.find(l => l.uuid === uuid)
      if (!layer) return null
      await addLayer(layer)
    }

    layerConditions.value[uuid] = JSON.parse(JSON.stringify(safeConds))
    return uuid
  }

  function deleteSavedQuery(id) {
    savedQueries.value = savedQueries.value.filter(q => q.id !== id)
  }

  // ── پاک کردن همه داده‌های ذخیره‌شده ──
  function clearAllLocalData() {
    // پاک کردن localStorage (فقط کوئری‌های ذخیره‌شده در localStorage است)
    Object.values(LS_KEYS).forEach(key => localStorage.removeItem(key))
    try { LEGACY_RADIUS_KEYS.forEach(k => localStorage.removeItem(k)) } catch {}
    for (const [, c] of inFlight) c.abort()
    inFlight.clear()
    // ریست state بدون reload
    savedQueries.value    = []
    activeLayers.value    = []
    layerFeaturesMap.value = {}
    layerFieldsMap.value = {}
    layerConditions.value = {}
    radiusKm.value        = DEFAULT_RADIUS_KM
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
    allWells: allFeatures,
    combinedResults, hasAnyFilter,
    getLayerConditions, addLayerCondition, removeLayerCondition, getLayerResultCount,
    radiusCenter, radiusKm,
    savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
    clearAllLocalData,
  }
}
import { ref, computed, watch, onScopeDispose } from 'vue'
import { findWithinRadius, isValidLatLng } from './useGeoUtils.js'
import { findMatchingRowsMulti, findMatchingRowsMultiAsync, lastRelationStats } from './useSpatialRelations.js'
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
  activeLayers: 'wqa:activeLayers',
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
  if (rowValue === null || rowValue === undefined) return null
  const v = typeof value === 'string' ? value.trim() : value
  switch (operator) {
    // مقایسه متنی بدون حساسیت به بزرگی/کوچکی حروف
    case '=':       return String(rowValue).trim().toLowerCase() === String(v ?? '').trim().toLowerCase()
    case '!=':      return String(rowValue).trim().toLowerCase() !== String(v ?? '').trim().toLowerCase()
    case '>':
    case '>=':
    case '<':
    case '<=': {
      if (typeof rowValue === 'string' && rowValue.trim() === '') return null
      const a = Number(rowValue), b = Number(v)
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null
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
      return cond.not ? r === false : r === true
    })
  )
}

// ─── Composable ───────────────────────────────────────────

export function useWellQuery() {
  const vectorLayers   = ref([])
  const activeLayers   = ref([])
  const selectedLayer  = computed(() => activeLayers.value[0] ?? null)

  // لایه‌هایی که کاربر با آیکون چشم پنهان کرده است (خارج از نقشه و نتایج، ولی همچنان در لیست)
  const hiddenLayers = ref(new Set())
  function isLayerVisible(uuid) {
    return !hiddenLayers.value.has(String(uuid))
  }
  function toggleLayerVisibility(uuid) {
    const key = String(uuid)
    const hidden = new Set(hiddenLayers.value)
    if (hidden.has(key)) hidden.delete(key)
    else hidden.add(key)
    hiddenLayers.value = hidden
    rebuildAggregated()
    maybeRecomputeRelation()
  }

  // ── انتخاب عارضه (Selection Set به سبک ArcGIS) ──
  // کلید یکتا: `${layerUuid}::${id}` — شناسه‌ها ممکن است بین لایه‌ها تکراری باشند
  const selectedKeys = ref(new Set())
  // محدوده کوئری توصیفی: همه عوارض یا فقط انتخاب‌شده‌ها
  const attributeScope = ref('all')
  // Keep the committed input independent of the next mouse/query selection.
  const appliedAttributeKeys = ref(null)
  const appliedAttributeLayers = ref(null)
  // حالت مبدأ رابطه مکانی: عوارض انتخاب‌شده یا کل لایه مبدأ
  const relationSourceMode = ref('layer')
  // محدود کردن نامزدهای هدف رابطه به عوارض انتخاب‌شده
  const spatialTargetOnlySelected = ref(false)

  function rowKeyOf(r) {
    if (!r) return ''
    return r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? '')
  }
  function isSelectedRow(r) {
    const k = rowKeyOf(r)
    return !!k && selectedKeys.value.has(k)
  }
  // ترکیب نتیجه ابزار انتخاب با انتخاب فعلی (مثل ArcGIS):
  // new = جایگزینی، add = افزودن، remove = حذف، subset = اشتراک (انتخاب از میان انتخاب‌شده)
  function applySelectionKeys(incoming, mode = 'new') {
    const next = new Set(mode === 'new' ? [] : selectedKeys.value)
    if (mode === 'subset') {
      const inc = new Set((incoming ?? []).map(String))
      for (const k of [...next]) {
        if (!inc.has(k)) next.delete(k)
      }
    } else if (mode === 'remove') {
      for (const k of (incoming ?? []).map(String)) next.delete(k)
    } else if (mode === 'add') {
      for (const k of (incoming ?? []).map(String)) next.add(k)
    } else {
      for (const k of (incoming ?? []).map(String)) next.add(k)
    }
    selectedKeys.value = next
    return next.size
  }
  // جایگزینی کامل مجموعه انتخاب (مثلاً از جدول داده‌های توصیفی؛ دوسویه با نقشه)
  function setSelectionKeys(keys) {
    selectedKeys.value = new Set((keys ?? []).map(String))
    return selectedKeys.value.size
  }
  function clearSelection() {
    selectedKeys.value = new Set()
  }
  const selectionCount = computed(() => selectedKeys.value.size)
  const selectedIds = computed(() => [...selectedKeys.value])
  const selectedRows = computed(() => {
    if (!selectedKeys.value.size) return []
    const set = selectedKeys.value
    return allFeatures.value.filter(r => set.has(rowKeyOf(r)))
  })

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
  let layerRevision = 0
  let disposed = false
  let layersController = null
  async function loadLayerData(layer, opts = {}) {
    const needFields = !layerFieldsMap.value[layer.uuid]
    const needFeatures = !layerFeaturesMap.value[layer.uuid]
    if (!needFields && !needFeatures) return
    inFlight.get(layer.uuid)?.abort()
    const ctrl = new AbortController()
    inFlight.set(layer.uuid, ctrl)
    const signal = ctrl.signal
    const onAbort = () => ctrl.abort()
    opts.signal?.addEventListener('abort', onAbort, { once: true })
    if (opts.signal?.aborted) ctrl.abort()
    try {
      const [fields, raw] = await Promise.all([
        needFields ? fetchLayerFields(layer.uuid, { signal }) : null,
        needFeatures ? fetchAllFeatures(layer.uuid, { signal }) : null,
      ])
      if (signal.aborted || disposed || inFlight.get(layer.uuid) !== ctrl) {
        throw new DOMException('aborted', 'AbortError')
      }
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
    } catch (error) {
      ctrl.abort()
      throw error
    } finally {
      opts.signal?.removeEventListener('abort', onAbort)
      if (inFlight.get(layer.uuid) === ctrl) inFlight.delete(layer.uuid)
    }
  }

  // ── بارگذاری لایه‌ها ──
  async function loadVectorLayers() {
    if (disposed) return
    layersController?.abort()
    const controller = new AbortController()
    layersController = controller
    loadingLayers.value = true
    apiError.value = null
    try {
      const layers = await fetchVectorLayers({ signal: controller.signal })
      if (disposed || controller.signal.aborted) return
      vectorLayers.value = layers
      // بازیابی لایه‌های انتخاب‌شده از نشست قبل
      try {
        const saved = lsGet(LS_KEYS.activeLayers, [])
        if (Array.isArray(saved) && saved.length) {
          const wanted = new Set(saved.map(String))
          const restored = vectorLayers.value.filter(l => wanted.has(String(l.uuid)))
          if (restored.length) {
            await setActiveLayers(restored)
          }
        }
      } catch {}
    } catch (e) {
      if (!disposed && !controller.signal.aborted) apiError.value = e.message
    } finally {
      if (!disposed && layersController === controller) loadingLayers.value = false
    }
  }

  // ── بازسازی aggregated ──
// لایه‌های غیرفعال (پنهان با چشم): از نقشه، نتایج و جستجوها حذف می‌شوند؛
// تب آن‌ها هم از جدول نتایج کنار می‌رود. داده‌ها در حافظه محفوظ می‌ماند تا با فعال‌سازی برگردد.
// نکته پرفورمنس: push(...rows) با آرایه‌های چندده‌هزاری استک را منفجر می‌کند؛ حلقه استفاده شد.
  function rebuildAggregated() {
    let total = 0
    for (const layer of activeLayers.value) {
      if (!isLayerVisible(layer.uuid)) continue
      total += (layerFeaturesMap.value[layer.uuid] ?? []).length
    }
    const combined = new Array(total)
    let idx = 0
    for (const layer of activeLayers.value) {
      if (!isLayerVisible(layer.uuid)) continue
      const rows = layerFeaturesMap.value[layer.uuid] ?? []
      for (let i = 0; i < rows.length; i++) combined[idx++] = rows[i]
    }
    allFeatures.value = combined
    const available = new Set(combined.map(rowKeyOf))
    selectedKeys.value = new Set([...selectedKeys.value].filter(key => available.has(key)))

    const fieldMap = {}
    for (const layer of activeLayers.value) {
      if (!isLayerVisible(layer.uuid)) continue
      const fields = layerFieldsMap.value[layer.uuid] ?? []
      for (const f of fields) {
        if (!fieldMap[f.key]) fieldMap[f.key] = f
      }
    }
    queryableFields.value = Object.values(fieldMap)
  }

  // لایه‌های انتخاب‌شده در localStorage ذخیره می‌شوند تا با رفرش باقی بمانند
  watch(activeLayers, (val) => {
    try {
      if (val?.length) lsSet(LS_KEYS.activeLayers, val.map(layer => layer.uuid))
      else localStorage.removeItem(LS_KEYS.activeLayers)
    } catch {}
  })

  // ── اضافه کردن یک لایه ──
  async function addLayer(layer) {
    if (disposed) return
    const revision = layerRevision
    if (activeLayers.value.find(l => l.uuid === layer.uuid)) return
    apiError.value = null
    const needData = !layerFieldsMap.value[layer.uuid] || !layerFeaturesMap.value[layer.uuid]
    if (needData) {
      loadingFields.value   = true
      loadingFeatures.value = true
      try {
        await loadLayerData(layer)
      } catch (e) {
        if (e?.name !== 'AbortError' && revision === layerRevision && !disposed) apiError.value = e.message
        return
      } finally {
        loadingFields.value   = inFlight.size > 0
        loadingFeatures.value = inFlight.size > 0
      }
    }
    if (disposed || revision !== layerRevision) return
    if (activeLayers.value.some(l => l.uuid === layer.uuid)) return
    activeLayers.value = [...activeLayers.value, layer]
    rebuildAggregated()
    ensureLayerConditions(layer.uuid)
  }

  // ── حذف یک لایه ──
  function removeLayer(uuid) {
    cancelSpatialQuery()
    inFlight.get(uuid)?.abort()
    inFlight.delete(uuid)
    activeLayers.value = activeLayers.value.filter(l => String(l.uuid) !== String(uuid))
    delete layerFeaturesMap.value[uuid]
    delete layerFieldsMap.value[uuid]
    // کلیدهای انتخاب‌شده این لایه هم پاک می‌شوند
    if (selectedKeys.value.size) {
      const prefix = `${uuid}::`
      const next = new Set([...selectedKeys.value].filter(k => !String(k).startsWith(prefix)))
      // کلیدهای بدون پیشوند لایه (قدیمی) را نگه می‌داریم
      selectedKeys.value = next
    }
    // اگر لایه حذف‌شده مبدأ/هدف رابطه مکانی بود، رابطه پاک می‌شود
    const rc = relationCommitted.value
    if (rc && (String(rc.sourceLayerUuid) === String(uuid) || String(rc.targetLayerUuid) === String(uuid))) {
      clearRelation()
    }
    const hidden = new Set(hiddenLayers.value)
    hidden.delete(String(uuid))
    hiddenLayers.value = hidden
    rebuildAggregated()
    delete layerConditions.value[uuid]
    delete appliedConditions.value[uuid]
    if (appliedAttributeLayers.value?.has(String(uuid))) {
      const remaining = new Set(appliedAttributeLayers.value)
      remaining.delete(String(uuid))
      appliedAttributeLayers.value = remaining.size ? remaining : null
      if (!remaining.size) appliedAttributeKeys.value = null
    }
  }

  // ── تنظیم دسته‌ای لایه‌ها ──
  async function setActiveLayers(layers) {
    if (disposed) return
    cancelSpatialQuery()
    const revision = ++layerRevision
    for (const [, c] of inFlight) c.abort()
    inFlight.clear()
    if (!layers.length) {
      activeLayers.value = []
      loadingFields.value = loadingFeatures.value = false
      rebuildAggregated()
      clearRelation()
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
        const results = await Promise.allSettled(needsLoad.map(layer => loadLayerData(layer)))
        if (disposed || revision !== layerRevision) return
        results.forEach((r, i) => {
          if (r.status === 'rejected') {
            failed.add(needsLoad[i].uuid)
          }
        })
        if (failed.size) {
          apiError.value = `بارگذاری ${failed.size} لایه ناموفق بود و نادیده گرفته شد.`
        }
      } finally {
        if (revision === layerRevision && !disposed) {
          loadingFields.value   = inFlight.size > 0
          loadingFeatures.value = inFlight.size > 0
        }
      }
    }
    if (disposed || revision !== layerRevision) return
    const okLayers = layers.filter(l => !failed.has(l.uuid))
    for (const old of activeLayers.value) {
      if (!okLayers.some(l => String(l.uuid) === String(old.uuid))) removeLayer(old.uuid)
    }
    activeLayers.value = okLayers
    const stillActive = new Set(okLayers.map(l => String(l.uuid)))
    const pruned = new Set([...hiddenLayers.value].filter(u => stillActive.has(u)))
    hiddenLayers.value = pruned
    rebuildAggregated()
    maybeRecomputeRelation()

    for (const l of okLayers) ensureLayerConditions(l.uuid)
  }

  // ── کوئری توصیفی (دو مرحله‌ای مثل کوئری مکانی) ──
  // layerConditions: پیش‌نویسِ در حال ویرایش در کوئری‌ساز
  // appliedConditions: شرط‌های تأییدشده با دکمه «اجرای کوئری» (مبنای نتایج و خلاصه شرط‌ها)
  const layerConditions = ref({})
  const appliedConditions = ref({})

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
    if (!appliedConditions.value[uuid]) {
      appliedConditions.value[uuid] = JSON.parse(JSON.stringify(layerConditions.value[uuid] ?? []))
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

  // شرط‌های تأییدشده یک لایه (مبنای نتایج و خلاصه شرط‌ها)
  function getAppliedConditions(uuid) {
    ensureLayerConditions(uuid)
    return appliedConditions.value[uuid]
  }

  // تأیید پیش‌نویس همه لایه‌ها (دکمه «اجرای کوئری»)
  function applyAttributeConditions(snapshot = null) {
    const visible = activeLayers.value.filter(l => isLayerVisible(l.uuid))
    const constrained = visible.filter(l => (layerConditions.value[l.uuid] ?? [])
      .some(c => c.value !== '' && c.value !== null && c.value !== undefined))
    appliedAttributeLayers.value = new Set(snapshot?.layerUuids ?? (constrained.length ? constrained : visible).map(l => String(l.uuid)))
    appliedAttributeKeys.value = (snapshot?.scope ?? attributeScope.value) === 'selected'
      ? new Set(snapshot?.selectionKeys ?? selectedKeys.value) : null
    for (const layer of activeLayers.value) {
      ensureLayerConditions(layer.uuid)
      appliedConditions.value[layer.uuid] = JSON.parse(JSON.stringify(layerConditions.value[layer.uuid] ?? []))
    }
  }

  // حذف یک شرط تأییدشده (دکمه × در خلاصه شرط‌ها)
  function removeAppliedCondition(uuid, index) {
    if (!appliedConditions.value[uuid]) return
    appliedConditions.value[uuid].splice(index, 1)
  }

  // ── پاک کردن تمام شرط‌های توصیفی فعال (پیش‌نویس و تأییدشده) ──
  function clearAllConditions() {
    appliedAttributeKeys.value = null
    appliedAttributeLayers.value = null
    for (const layer of activeLayers.value) {
      const uuid = layer.uuid
      const fields = layerFieldsMap.value[uuid] ?? []
      const fresh = fields.length ? [{
        field: fields[0].key,
        operator: fields[0].type === 'number' ? '>' : '=',
        value: '',
        logic: 'AND',
        not: false,
      }] : []
      layerConditions.value[uuid] = JSON.parse(JSON.stringify(fresh))
      appliedConditions.value[uuid] = JSON.parse(JSON.stringify(fresh))
    }
  }

  // پیش‌نمایش زنده در کوئری‌ساز (مبنای شمارنده بالای فرم): بر اساس پیش‌نویس
  // memoize شد: روی هر رندر/تایپِ نامرتبط، فیلتر چندده‌هزاری دوباره اجرا نمی‌شود
  const _countCache = new Map()
  function getLayerResultCount(uuid) {
    if (!isLayerVisible(uuid)) return 0
    const sourceRows = layerFeaturesMap.value[uuid] ?? []
    let rows = sourceRows
    const selection = attributeScope.value === 'selected' ? selectedKeys.value : null
    // محدوده «فقط انتخاب‌شده‌ها»: شمارش زنده هم فقط روی انتخاب‌شده‌ها
    if (selection !== null) {
      const set = selectedKeys.value
      rows = rows.filter(r => set.has(rowKeyOf(r)))
    }
    const conds = layerConditions.value[uuid] ?? []
    const active = conds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
    if (!active.length) return rows.length
    const sig = JSON.stringify([attributeScope.value, selectedKeys.value.size, active.map(c => [c.field, c.operator, c.value, c.logic, !!c.not])])
    const cached = _countCache.get(uuid)
    if (cached && cached.sig === sig && cached.sourceRows === sourceRows && cached.selection === selection) return cached.count
    const count = rows.filter(row => evaluateGroup(row, active)).length
    _countCache.set(uuid, { sig, sourceRows, selection, count })
    // جلوگیری از رشد بی‌نهایت کش
    if (_countCache.size > 64) _countCache.delete(_countCache.keys().next().value)
    return count
  }

  // نتایج نهایی: فقط بر اساس شرط‌های تأییدشده
  // اگر محدوده «فقط انتخاب‌شده‌ها» فعال باشد، نامزدهای هر لایه به انتخاب‌شده‌ها محدود می‌شود
  const attributeResults = computed(() => {
    if (!activeLayers.value.length) return allFeatures.value
    const selSet = appliedAttributeKeys.value
    const onlySel = selSet !== null
    const results = []
    for (const layer of activeLayers.value) {
      if (!isLayerVisible(layer.uuid)) continue
      if (appliedAttributeLayers.value && !appliedAttributeLayers.value.has(String(layer.uuid))) continue
      let rows  = layerFeaturesMap.value[layer.uuid] ?? []
      if (onlySel) rows = rows.filter(r => selSet.has(rowKeyOf(r)))
      const conds = appliedConditions.value[layer.uuid] ?? []
      const active = conds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
      for (const row of rows) if (!active.length || evaluateGroup(row, active)) results.push(row)
    }
    return results
  })

  const hasAttributeFilter = computed(() =>
    appliedAttributeLayers.value !== null || appliedAttributeKeys.value !== null || activeLayers.value.some(layer => {
      if (!isLayerVisible(layer.uuid)) return false
      const conds = appliedConditions.value[layer.uuid] ?? []
      return conds.some(c => c.value !== '' && c.value !== null && c.value !== undefined)
    })
  )

  const hasSpatialFilter = computed(() => hasRadiusFilter.value || hasRelationFilter.value)

  // ترکیب فیلترهای مکانی (شعاعی و رابطه‌ای) با اشتراک
  const spatialResults = computed(() => {
    const hasR = hasRadiusFilter.value
    const hasRel = hasRelationFilter.value
    if (!hasR && !hasRel) return []
    if (hasR && !hasRel) return radiusResults.value
    if (!hasR && hasRel) return relationResults.value
    const makeKey = r => `${r._layerUuid}::${r.id}`
    const relKeys = new Set(relationResults.value.map(makeKey))
    return radiusResults.value.filter(r => relKeys.has(makeKey(r)))
  })

  const combinedResults = computed(() => {
    const makeKey = r => `${r._layerUuid}::${r.id}`
    if (!hasAttributeFilter.value && !hasSpatialFilter.value) return allFeatures.value
    if (!hasSpatialFilter.value) return attributeResults.value
    if (!hasAttributeFilter.value) return spatialResults.value
    const spatialKeys = new Set(spatialResults.value.map(makeKey))
    return attributeResults.value.filter(r => spatialKeys.has(makeKey(r)))
  })

  const hasAnyFilter = computed(() => hasAttributeFilter.value || hasSpatialFilter.value)

  // ── بازمحاسبه بدون‌اثر (برای تاریخچه کوئری‌ها) ──
  // نتیجه یک کوئری ثبت‌شده در تاریخچه، بدون تغییر state فعلی دوباره محاسبه می‌شود
  // (مبنای دکمه «ذخیره/خروجی Shapefile» ذیل جدول TOC)
  function computeAttributeRows(uuid, conditions, scope = 'all', selectionKeys = selectedKeys.value) {
    let rows = (layerFeaturesMap.value[uuid] ?? []).slice()
    if (scope === 'selected') {
      const set = new Set(selectionKeys ?? [])
      rows = rows.filter(r => set.has(rowKeyOf(r)))
    }
    const active = (conditions ?? []).filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
    return active.length ? rows.filter(row => evaluateGroup(row, active)) : rows
  }

  const attributeQueryLayerUuids = computed(() => activeLayers.value
    .filter(l => isLayerVisible(l.uuid) && (!appliedAttributeLayers.value || appliedAttributeLayers.value.has(String(l.uuid))))
    .map(l => String(l.uuid)))

  function captureAttributeQuery() {
    return {
      scope: appliedAttributeKeys.value === null ? 'all' : 'selected',
      selectionKeys: appliedAttributeKeys.value === null ? null : [...appliedAttributeKeys.value],
      items: attributeQueryLayerUuids.value.map(uuid => ({ layerUuid: uuid,
        layerName: activeLayers.value.find(l => String(l.uuid) === uuid)?.display_name
          || activeLayers.value.find(l => String(l.uuid) === uuid)?.name,
        conditions: JSON.parse(JSON.stringify(appliedConditions.value[uuid] ?? [])),
      })),
    }
  }

  async function restoreAttributeQuery(snapshot) {
    if (snapshot.scope === 'selected' && !Array.isArray(snapshot.selectionKeys)) {
      throw new Error('انتخاب اولیه این تاریخچه قدیمی ذخیره نشده است؛ کوئری را دوباره بسازید.')
    }
    for (const item of snapshot.items ?? []) {
      if (!await loadSavedQuery(item)) throw new Error('لایه مورد نیاز تاریخچه در دسترس نیست.')
      if (!isLayerVisible(item.layerUuid)) toggleLayerVisibility(item.layerUuid)
    }
    attributeScope.value = snapshot.scope === 'selected' ? 'selected' : 'all'
    applyAttributeConditions({ scope: attributeScope.value, selectionKeys: snapshot.selectionKeys,
      layerUuids: (snapshot.items ?? []).map(item => String(item.layerUuid)) })
  }

  function computeRelationRows(params) {
    if (!params?.targetLayerUuid) return []
    const sourceRows = params.sourceMode === 'selected'
      ? (params.sourceLayerUuid ? findRelationRows(params.sourceLayerUuid) : allFeatures.value).filter(row => (params.sourceKeys ?? []).includes(rowKeyOf(row)))
      : findRelationRows(params.sourceLayerUuid)
    if (!sourceRows.length) return []
    let targets = allFeatures.value.filter(r => String(r._layerUuid) === String(params.targetLayerUuid))
    if (params.targetOnlySelected) {
      const set = new Set(params.targetKeys ?? [])
      targets = targets.filter(r => set.has(rowKeyOf(r)))
    }
    if (!targets.length) return []
    return findMatchingRowsMulti(sourceRows, targets, params.operator, { radiusKm: params.radiusKm })
  }

  function computeHistoryRows(entry) {
    const attribute = entry.type === 'attribute' ? entry : entry.attribute
    const relation = entry.type === 'relation' ? entry.params : entry.spatial?.relation
    const radius = entry.type === 'relation' ? entry.radius : entry.spatial?.radius
    if (attribute?.scope === 'selected' && !Array.isArray(attribute.selectionKeys)) {
      throw new Error('انتخاب اولیه این تاریخچه قدیمی موجود نیست.')
    }
    if ((relation?.sourceMode === 'selected' && !Array.isArray(relation.sourceKeys)) ||
        (relation?.targetOnlySelected && !Array.isArray(relation.targetKeys))) {
      throw new Error('انتخاب اولیه رابطه در این تاریخچه قدیمی موجود نیست.')
    }
    let rows = null
    if (attribute) {
      rows = []
      for (const item of attribute.items ?? []) {
        for (const row of computeAttributeRows(item.layerUuid, item.conditions, attribute.scope, attribute.selectionKeys)) rows.push(row)
      }
    }
    if (relation) {
      const related = computeRelationRows(relation)
      const keys = new Set(related.map(rowKeyOf))
      rows = rows ? rows.filter(row => keys.has(rowKeyOf(row))) : related
    }
    if (radius) rows = filterRadiusRows(rows ?? allFeatures.value, radius.center, radius.radiusKm)
    return rows ?? []
  }

  // ── کوئری مکانی (فقط کیلومتر، بدون سقف) ──
  // شعاع عمداً در localStorage ذخیره نمی‌شود تا با رفرش صفحه به دیفالت برگردد
  const DEFAULT_RADIUS_KM = 3
  const radiusCenter  = ref(null)
  const radiusKm      = ref(DEFAULT_RADIUS_KM)
  // مقادیر تأییدشده (فقط بعد از کلیک Apply اعمال می‌شوند)
  const committedRadiusCenter = ref(null)
  const committedRadiusKm = ref(DEFAULT_RADIUS_KM)
  const spatialLoading = ref(false)
  let spatialRevision = 0
  function cancelSpatialQuery() {
    spatialRevision++
    relationReqId++
    relationAbortCtrl?.abort()
    clearTimeout(_relRetimer)
    spatialLoading.value = false
  }
  function clearSpatialFilter() {
    cancelSpatialQuery()
    radiusCenter.value = committedRadiusCenter.value = null
    radiusKm.value = committedRadiusKm.value = DEFAULT_RADIUS_KM
  }
  // پاک‌سازی مقادیر قدیمی ذخیره‌شده (نسخه‌های قبلی) تا حتماً دیفالت اعمال شود
  try { LEGACY_RADIUS_KEYS.forEach(k => localStorage.removeItem(k)) } catch {}

  function filterRadiusRows(rows, center, km) {
    if (!center) return []
    const rKm = Number(km)
    if (!Number.isFinite(rKm) || rKm <= 0) return []
    const centerKey = center._layerUuid ? `${center._layerUuid}::${center.id}` : null
    const candidates = rows.filter(f => {
      if (!isValidLatLng(f)) return false
      if (centerKey) return `${f._layerUuid}::${f.id}` !== centerKey
      return center.id === undefined || String(f.id) !== String(center.id)
    })
    return findWithinRadius(candidates, center, rKm)
  }
  const radiusResults = computed(() => filterRadiusRows(allFeatures.value, committedRadiusCenter.value, committedRadiusKm.value))

  // ── اعمال تغییرات مکانی (با لودینگ) ──
  async function commitSpatialFilter() {
    const center = radiusCenter.value ? { ...radiusCenter.value } : null
    const km = Number(radiusKm.value)
    if (disposed || !isValidLatLng(center) || !Number.isFinite(km) || km <= 0) return false
    cancelSpatialQuery()
    const revision = spatialRevision
    spatialLoading.value = true
    await new Promise(r => setTimeout(r, 250))
    if (disposed || revision !== spatialRevision) return false
    committedRadiusCenter.value = center
    committedRadiusKm.value = km
    spatialLoading.value = false
    return true
  }

  // ── رابطه مکانی (مبدأ = انتخاب‌شده‌ها یا کل لایه + لایه هدف + عملگر) ──
  // پیش‌نویس فرم و مقادیر تأییدشده (فقط بعد از «اجرای کوئری» اثر می‌کنند)
  const relationSourceLayer = ref(null)
  const relationTargetLayer = ref(null)
  const relationOperator    = ref([])
  const relationRadiusKm    = ref(3)
  const relationCommitted   = ref(null)

  function findRelationRows(layerUuid) {
    if (!layerUuid) return []
    return allFeatures.value.filter(r =>
      String(r._layerUuid) === String(layerUuid)
    )
  }

  // سطرهای مبدأ: در حالت selected فقط انتخاب‌شده‌های لایه مبدأ، وگرنه کل لایه
  function getRelationSourceRows(layerUuid, mode) {
    const rows = findRelationRows(layerUuid)
    if (mode === 'selected') {
      if (!selectedKeys.value.size) return []
      const set = selectedKeys.value
      return rows.filter(r => set.has(rowKeyOf(r)))
    }
    return rows
  }

  // نتایج رابطه مکانی — عمداً ref (نه computed) تا محاسبات سنگین O(S*T)
  // روی نخ اصلی به‌صورت تکه‌تکه (chunked) اجرا شود و دیالوگ wait مرورگر نیاید.
  // قبلاً computed همگام بود و روی لایه‌های بزرگ کل UI را فریز می‌کرد.
  const relationResults = ref([])
  const relationProgress = ref({ done: 0, total: 0 })
  const relationError = ref(null)
  let relationReqId = 0
  let relationAbortCtrl = null
  // زیر این سقف جفت، مسیر همگام سریع کافی است؛ بالاتر chunked آسنکرون
  const SYNC_PAIR_LIMIT = 2000

  async function computeRelationResults(c = relationCommitted.value) {
    const myId = ++relationReqId
    relationAbortCtrl?.abort()
    const ctrl = new AbortController()
    relationAbortCtrl = ctrl
    relationError.value = null
    if (!c) {
      relationResults.value = []
      relationProgress.value = { done: 0, total: 0 }
      return []
    }
    const sourceRows = c.sourceMode === 'selected'
      ? (c.sourceLayerUuid ? findRelationRows(c.sourceLayerUuid) : allFeatures.value).filter(row => (c.sourceKeys ?? []).includes(rowKeyOf(row)))
      : findRelationRows(c.sourceLayerUuid)
    if (!sourceRows.length) {
      if (myId === relationReqId) {
        relationResults.value = []
        relationProgress.value = { done: 0, total: 0 }
      }
      return []
    }
    let targets = allFeatures.value.filter(r =>
      String(r._layerUuid) === String(c.targetLayerUuid)
    )
    // محدود کردن نامزدهای هدف به عوارض انتخاب‌شده (کوئری از روی انتخاب‌شده‌ها)
    if (c.targetOnlySelected) {
      const set = new Set(c.targetKeys ?? [])
      targets = targets.filter(r => set.has(rowKeyOf(r)))
    }
    if (!targets.length) {
      if (myId === relationReqId) {
        relationResults.value = []
        relationProgress.value = { done: 0, total: 0 }
      }
      return []
    }
    const pairs = sourceRows.length * targets.length
    const relOpts = { radiusKm: c.radiusKm }
    try {
      let out
      if (pairs <= SYNC_PAIR_LIMIT) {
        // فرصت یک فریم تا اسپینر لودینگ واقعاً رندر شود، بعد محاسبه سریع
        await new Promise(r => setTimeout(r, 30))
        if (ctrl.signal.aborted || myId !== relationReqId || disposed) return null
        out = findMatchingRowsMulti(sourceRows, targets, c.operator, relOpts)
      } else {
        relationProgress.value = { done: 0, total: targets.length }
        out = await findMatchingRowsMultiAsync(sourceRows, targets, c.operator, {
          ...relOpts,
          signal: ctrl.signal,
          chunkTargets: 300,
          onProgress: (done, total) => {
            if (myId === relationReqId) relationProgress.value = { done, total }
          },
        })
      }
      if (myId === relationReqId && !ctrl.signal.aborted && !disposed) {
        relationResults.value = out
        relationProgress.value = { done: targets.length, total: targets.length }
        // اگر زوج‌های زیادی به‌خاطر هندسه نامعتبر رد شدند و نتیجه‌ای نیست، هشدار بده
        try {
          const st = lastRelationStats
          if ((!out || !out.length) && st && st.errors > 0) {
            relationError.value = `${st.errors.toLocaleString('fa-IR')} زوج هندسه نامعتبر نادیده گرفته شد؛ اگر عارضه‌ای باید در نتیجه می‌بود، هندسه لایه را بررسی کنید.`
          }
        } catch {}
      }
      return myId === relationReqId && !ctrl.signal.aborted && !disposed ? out : null
    } catch (e) {
      if (e?.name === 'AbortError') return null
      if (myId === relationReqId) {
        relationError.value = e?.message ?? 'خطا در محاسبه رابطه مکانی'
        relationResults.value = []
      }
      return null
    }
  }

  // اگر رابطه‌ای تأییدشده فعال است و داده مبنا عوض شد (مخفی/حذف لایه)،
  // نتایج را در پس‌زمینه بازمحاسبه کن تا شمارش‌ها درست بمانند
  let _relRetimer = null
  function maybeRecomputeRelation() {
    cancelSpatialQuery()
    if (!relationCommitted.value) return
    relationResults.value = []
    clearTimeout(_relRetimer)
    _relRetimer = setTimeout(() => { computeRelationResults() }, 60)
  }

  const hasRadiusFilter   = computed(() => committedRadiusCenter.value !== null)
  const hasRelationFilter = computed(() => relationCommitted.value !== null)

  // اعمال رابطه مکانی (با لودینگ؛ محاسبات سنگین تکه‌تکه بعد از رندر لودینگ انجام می‌شود)
  // مبدأ = عوارض انتخاب‌شده (حالت selected) یا کل لایه مبدأ (حالت layer)
  async function commitRelationFilter(snapshot = null) {
    if (disposed) return false
    if (!snapshot && !relationTargetLayer.value) return false
    if (!snapshot && (!Array.isArray(relationOperator.value) || !relationOperator.value.length)) return false
    const mode = relationSourceMode.value || 'selected'
    if (!snapshot && mode === 'selected') {
      if (!selectedKeys.value.size) return false
      // حداقل یک عارضه انتخاب‌شده باید در لایه مبدأ باشد
      const hasInSource = relationSourceLayer.value
        ? getRelationSourceRows(relationSourceLayer.value, 'selected').length > 0
        : selectedRows.value.length > 0
      if (!hasInSource) return false
    } else if (!snapshot && !relationSourceLayer.value) {
      return false
    }
    // در حالت انتخاب‌شده، نبود محدودیت لایه یعنی استفاده از همه انتخاب‌ها.
    const srcUuid = relationSourceLayer.value
    const sources = srcUuid ? getRelationSourceRows(srcUuid, mode) : selectedRows.value
    const candidate = snapshot ? JSON.parse(JSON.stringify(snapshot)) : {
      sourceLayerUuid: srcUuid,
      sourceLayerUuids: [...new Set(sources.map(row => row._layerUuid))],
      targetLayerUuid: relationTargetLayer.value,
      operator: [...relationOperator.value],
      radiusKm: Number(relationRadiusKm.value),
      sourceMode: mode,
      sourceKeys: mode === 'selected' ? sources.map(rowKeyOf) : null,
      targetKeys: spatialTargetOnlySelected.value ? [...selectedKeys.value] : null,
      targetOnlySelected: !!spatialTargetOnlySelected.value,
    }
    if ((!candidate.sourceLayerUuid && candidate.sourceMode !== 'selected') || !candidate.targetLayerUuid || !candidate.operator?.length) return false
    if (candidate.operator.includes('within-distance') && (!Number.isFinite(candidate.radiusKm) || candidate.radiusKm <= 0)) return false
    cancelSpatialQuery()
    const revision = spatialRevision
    spatialLoading.value = true
    relationProgress.value = { done: 0, total: 0 }
    // Snapshot the submitted form before yielding to render the spinner.
    await new Promise(r => setTimeout(r, 60))
    if (disposed || revision !== spatialRevision) return false
    attributeScope.value = 'all'
    try {
      const out = await computeRelationResults(candidate)
      if (out === null || disposed || revision !== spatialRevision) return false
      relationCommitted.value = candidate
      return true
    } finally {
      if (revision === spatialRevision && !disposed) spatialLoading.value = false
    }
  }

  function clearRelation() {
    cancelSpatialQuery()
    relationSourceLayer.value = null
    relationTargetLayer.value = null
    relationOperator.value    = []
    relationRadiusKm.value    = 3
    relationSourceMode.value  = 'layer'
    spatialTargetOnlySelected.value = false
    relationCommitted.value   = null
    relationResults.value = []
    relationProgress.value = { done: 0, total: 0 }
    relationError.value = null
  }

  // ── کوئری‌های ذخیره‌شده ──
  const rawSaved = lsGet(LS_KEYS.savedQueries, [])
  const savedQueries = ref(Array.isArray(rawSaved) ? rawSaved.filter(q => q && typeof q.layerUuid === 'string' && Array.isArray(q.conditions)) : [])

  watch(savedQueries, val => {
    if (val.length) lsSet(LS_KEYS.savedQueries, val)
    else localStorage.removeItem(LS_KEYS.savedQueries)
  }, { deep: true })

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
      if (!activeLayers.value.some(l => l.uuid === uuid)) return null
    }

    appliedAttributeKeys.value = null
    appliedAttributeLayers.value = new Set([...(appliedAttributeLayers.value ?? []), String(uuid)])
    layerConditions.value[uuid] = JSON.parse(JSON.stringify(safeConds))
    appliedConditions.value[uuid] = JSON.parse(JSON.stringify(safeConds))
    return uuid
  }

  function deleteSavedQuery(id) {
    savedQueries.value = savedQueries.value.filter(q => q.id !== id)
  }

  // ── پاک کردن همه داده‌های ذخیره‌شده ──
  function clearSavedQueries() {
    savedQueries.value = []
    localStorage.removeItem(LS_KEYS.savedQueries)
  }

  function clearLayers() {
    cancelSpatialQuery()
    layerRevision++
    // پاک کردن localStorage (کوئری‌های ذخیره‌شده + لایه‌های انتخاب‌شده)
    localStorage.removeItem(LS_KEYS.activeLayers)
    try { LEGACY_RADIUS_KEYS.forEach(k => localStorage.removeItem(k)) } catch {}
    for (const [, c] of inFlight) c.abort()
    inFlight.clear()
    loadingFields.value = loadingFeatures.value = false
    // ریست state بدون reload
    activeLayers.value    = []
    hiddenLayers.value    = new Set()
    layerFeaturesMap.value = {}
    layerFieldsMap.value = {}
    layerConditions.value = {}
    appliedConditions.value = {}
    radiusKm.value        = DEFAULT_RADIUS_KM
    radiusCenter.value    = null
    committedRadiusCenter.value = null
    committedRadiusKm.value = DEFAULT_RADIUS_KM
    clearRelation()
    clearSelection()
    attributeScope.value = 'all'
    appliedAttributeKeys.value = null
    appliedAttributeLayers.value = null
    relationSourceMode.value = 'selected'
    spatialTargetOnlySelected.value = false
    _countCache.clear()
    rebuildAggregated()
  }

  onScopeDispose(() => {
    cancelSpatialQuery()
    disposed = true
    layerRevision++
    relationReqId++
    relationAbortCtrl?.abort()
    clearTimeout(_relRetimer)
    layersController?.abort()
    for (const [, controller] of inFlight) controller.abort()
    inFlight.clear()
  })

  return {
    vectorLayers, activeLayers, selectedLayer,
    layerFieldsMap, layerFeaturesMap,
    queryableFields,
    loadingLayers, loadingFields, loadingFeatures, apiError,
    loadVectorLayers,
    addLayer, removeLayer, setActiveLayers,
    isLayerVisible, toggleLayerVisibility,
    allWells: allFeatures,
    combinedResults, hasAnyFilter,
    getLayerConditions, getAppliedConditions, addLayerCondition, removeLayerCondition,
    applyAttributeConditions, removeAppliedCondition, clearAllConditions, getLayerResultCount,
    computeAttributeRows, computeRelationRows, computeHistoryRows, captureAttributeQuery, restoreAttributeQuery, attributeQueryLayerUuids,
    radiusCenter, radiusKm,
    committedRadiusCenter, committedRadiusKm,
    spatialLoading, commitSpatialFilter, clearSpatialFilter, cancelSpatialQuery,
    hasAttributeFilter, hasSpatialFilter,
    relationSourceLayer, relationTargetLayer, relationOperator, relationRadiusKm,
    relationSourceMode, spatialTargetOnlySelected,
    selectedKeys, selectedIds, selectedRows, selectionCount,
    attributeScope, applySelectionKeys, setSelectionKeys, clearSelection, isSelectedRow, rowKeyOf,
    relationCommitted, relationResults, relationProgress, relationError, hasRelationFilter,
    commitRelationFilter, clearRelation,
    savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
    clearSavedQueries, clearLayers,
  }
}

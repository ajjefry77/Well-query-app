<template>
  <div class="app">
    <AppHeader
      :is-mobile="isMobile"
      :query-kind="queryKind"
      :crs="crs"
      :theme="theme"
      @update:query-kind="queryKind = $event"
      @update:crs="crs = $event"
      @toggle-theme="toggleTheme"
    />

    <!-- صفحه چینه‌شناسی -->
    <div v-if="queryKind === 'stratigraphy'" class="strat-page">
      <StratigraphyChart @back="queryKind = 'attribute'" />
    </div>

    <!-- صفحه اصلی -->
    <main v-else class="app-main" :style="isMobile ? { '--sheet-h': sheetHeight + 'px' } : {}">

      <!-- پنل چپ: کوئری‌ساز -->
      <QueryPanel
        v-show="!isMobile || (sheetOpen && mobileTab === 'query')"
        :open="queryPanelOpen"
        :query-kind="queryKind"
        :layers="activeLayers"
        :layer-details="layerDetails"
        :active-query-layer="activeQueryLayer"
        :loading-fields="loadingFields"
        :loading-features="loadingFeatures"
        :spatial-mode="spatialMode"
        :wells="allWells"
        :radius-center="radiusCenter"
        :radius-km="radiusKm"
        :spatial-group-fields="spatialGroupFields"
        :custom-point="customPoint"
        :is-picking-point="isPickingPoint"
        :spatial-loading="spatialLoading"
        :saved-queries="savedQueries"
        @toggle="toggleQueryPanel"
        @update:active-query-layer="activeQueryLayer = $event"
        @add-condition="addLayerCondition"
        @remove-condition="removeLayerCondition"
        @save-query="saveCurrentQuery"
        @apply-attribute="onApplyAttribute"
        @update:spatial-mode="spatialMode = $event"
        @update:radius-center="onUpdateRadiusCenter"
        @update:radius-km="radiusKm = $event"
        @pick-point="onPickPoint"
        @clear-point="onClearPoint"
        @clear-spatial="onClearSpatial"
        @apply-spatial="onApplySpatial"
        @load-query="onLoadQuery"
        @delete-query="deleteSavedQuery"
        @clear-data="handleClearData"
      />

      <!-- نقشه + دکمه FAB نتایج -->
      <section class="map-panel">
        <MapboxMap
           ref="mapRef"
           :wells="visibleWells"
           :wells-key="visibleWellsKey"
           :highlighted-ids="highlightedIds"
           :has-filter="hasAnyFilter"
           :radius-center="showRadiusOnMap ? committedRadiusCenter : null"
           :radius-km="committedRadiusKm"
            :selected-id="selectedWellId"
            :theme="theme"
            @select-well="onSelectFromMap"
            @map-empty-click="onMapEmptyClick"
          />

        <!-- لودینگ افزودن لایه تا آماده‌شدن نقشه -->
        <div v-if="mapLoading" class="map-loading-overlay">
          <div class="spinner-ring"></div>
          <span>در حال بارگذاری لایه‌ها…</span>
        </div>

        <!-- لودینگ اعمال تغییرات مکانی -->
        <div v-if="spatialLoading" class="map-loading-overlay">
          <div class="spinner-ring"></div>
          <span>در حال اعمال تغییرات…</span>
        </div>

        <!-- دکمه نمایش نتایج -->
        <button
          class="results-fab"
          :class="{ 'results-fab--active': displayRows.length > 0 }"
          @click="showResultsModal = true"
          aria-label="نمایش نتایج"
        >
          <span class="results-fab__label">نمایش نتایج</span>
          <span class="results-fab__count" v-if="displayRows.length > 0">{{ displayRows.length.toLocaleString('fa-IR') }}</span>
        </button>
      </section>

      <!-- پنل راست: لایه‌ها + خلاصه شرط‌ها -->
      <ResultsPanel
        v-show="!isMobile || (sheetOpen && mobileTab === 'layers')"
        :open="resultsPanelOpen"
        :layers="activeLayers"
        :loading-layers="loadingLayers"
        :summaries="layerQuerySummaries"
        :show-summary="hasActiveConditions || hasSpatialFilter"
        :hidden-layers="hiddenLayerUuids"
        :spatial-active="hasSpatialFilter"
        :spatial-label="spatialSummaryLabel"
        :spatial-radius="spatialSummaryRadius"
        @toggle="toggleResultsPanel"
        @open-modal="openLayerModal"
        @remove-layer="onRemoveLayer"
        @zoom-layer="onZoomToLayer"
        @toggle-layer-visibility="toggleLayerVisibility"
        @remove-condition="onRemoveAppliedCondition"
        @clear-spatial="onClearSpatial"
        @clear-all="onClearAllQueries"
      />

      <!-- موبایل: نوار grab + تب‌های پنل پایین -->
      <MobileSheet
        v-show="isMobile"
        :open="sheetOpen"
        :dragging="dragging"
        :mobile-tab="mobileTab"
        @update:mobile-tab="mobileTab = $event"
        @grab-start="onSheetGrabStart"
        @close="closeSheet"
      />
    </main>

    <!-- مدال انتخاب لایه -->
    <LayerModal
      v-if="showLayerModal"
      :open="showLayerModal"
      :layers="vectorLayers"
      :active-layers="activeLayers"
      @close="showLayerModal = false"
      @apply="applyLayerSelection"
    />

    <!-- مودال نتایج تمام‌صفحه -->
    <ResultsModal
      v-if="showResultsModal"
      :open="showResultsModal"
      :rows="displayRows"
      :columns="displayColumns"
      :layer-meta="displayLayerMeta"
      :active-id="activeWellId"
      @close="showResultsModal = false"
      @select="onSelectFromTable"
      @hover="onHoverRow"
      @export="handleExport"
    />
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, defineAsyncComponent, onMounted, onBeforeUnmount, watch } from 'vue'
import AppHeader from '../components/AppHeader.vue'
import { useWellQuery } from '../composables/useWellQuery.js'
import { useCoordinates } from '../composables/useCoordinates.js'
import { useTheme } from '../composables/useTheme.js'
import { layerColor } from '../composables/useLayerColors.js'
import { useRoute, useRouter } from '../router/index.js'

// بارگذاری تنبل: همه‌چیز به‌جز هدر، کد-split می‌شود تا First Paint روی سیستم ضعیف سریع باشد
const QueryPanel = defineAsyncComponent(() => import('../components/QueryPanel.vue'))
const ResultsPanel = defineAsyncComponent(() => import('../components/ResultsPanel.vue'))
const LayerModal = defineAsyncComponent(() => import('../components/LayerModal.vue'))
const ResultsModal = defineAsyncComponent(() => import('../components/ResultsModal.vue'))
const MobileSheet = defineAsyncComponent(() => import('../components/MobileSheet.vue'))
// بارگذاری تنبل: نقشه و نمودار چینه‌شناسی فقط هنگام نیاز لود می‌شوند
const MapboxMap = defineAsyncComponent(() => import('../components/MapboxMap.vue'))
const StratigraphyChart = defineAsyncComponent(() => import('../components/StratigraphyChart.vue'))

const { crs, convertFeature } = useCoordinates()
const { theme, toggle: toggleTheme } = useTheme()

const {
  vectorLayers, activeLayers,
  layerFieldsMap: _layerFieldsMap,
  layerFeaturesMap: _layerFeaturesMap,
  queryableFields,
  loadingLayers, loadingFields, loadingFeatures, apiError,
  loadVectorLayers,
  removeLayer, setActiveLayers,
  isLayerVisible, toggleLayerVisibility,
  allWells, combinedResults, hasAnyFilter,
  getLayerConditions, getAppliedConditions, addLayerCondition, removeLayerCondition,
  applyAttributeConditions, removeAppliedCondition, clearAllConditions, getLayerResultCount,
  radiusCenter, radiusKm,
  committedRadiusCenter, committedRadiusKm,
  spatialLoading, commitSpatialFilter,
  savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
  clearAllLocalData,
} = useWellQuery()

function layerFeatureCount(uuid) {
  return (_layerFeaturesMap.value?.[uuid] ?? []).length
}
function layerFields(uuid) {
  return _layerFieldsMap.value?.[uuid] ?? []
}

// ── همگام‌سازی تب با URL (route managing) ──
const VALID_VIEWS = ['attribute', 'spatial', 'stratigraphy']
const route = useRoute()
const router = useRouter()
function viewFromUrl() {
  const v = route.query?.view
  return VALID_VIEWS.includes(v) ? v : 'attribute'
}

const queryKind        = ref(viewFromUrl())
const spatialMode      = ref('map')
const mapRef           = shallowRef(null)
const activeWellId     = ref(null)
const selectedWellId   = ref(null)
const resultsPanelOpen = ref(true)
const customPoint      = ref(null)
const isPickingPoint   = ref(false)
const activeQueryLayer = ref(null)
const queryPanelOpen   = ref(true)
const showResultsModal = ref(false)

// تب → URL
watch(queryKind, (v) => {
  const cur = route.query?.view ?? 'attribute'
  if (v !== cur) router.replace({ path: '/', query: { ...route.query, view: v } })
})
// URL → تب (دکمه عقب/جلو مرورگر، دیپ‌لینک)
watch(() => route.query?.view, (v) => {
  if (VALID_VIEWS.includes(v) && v !== queryKind.value) queryKind.value = v
  else if (!v && queryKind.value !== 'attribute') queryKind.value = 'attribute'
})

// ── موبایل: پنل پایین (bottom sheet) ──
const isMobile    = ref(false)
const mobileTab   = ref('query')
const sheetHeight = ref(0)
const sheetOpen   = ref(true)
const dragging    = ref(false)
let dragState     = null

function clampSheet(v) {
  const max = Math.round(window.innerHeight * 0.85)
  return Math.round(Math.min(max, Math.max(0, v)))
}
function closeSheet() {
  sheetOpen.value = false
  sheetHeight.value = 0
}
function onSheetGrabStart(e) {
  if (!isMobile.value) return
  e.preventDefault()
  const wasClosed = !sheetOpen.value
  sheetOpen.value = true
  dragging.value = true
  dragState = { startY: e.clientY, startH: sheetHeight.value, wasClosed, moved: false }
  window.addEventListener('pointermove', onSheetGrabMove)
  window.addEventListener('pointerup', onSheetGrabEnd)
  window.addEventListener('pointercancel', onSheetGrabEnd)
}
function onSheetGrabMove(e) {
  if (!dragState) return
  if (Math.abs(e.clientY - dragState.startY) > 4) dragState.moved = true
  sheetHeight.value = clampSheet(dragState.startH + (dragState.startY - e.clientY))
}
function onSheetGrabEnd() {
  if (!dragState) return
  window.removeEventListener('pointermove', onSheetGrabMove)
  window.removeEventListener('pointerup', onSheetGrabEnd)
  window.removeEventListener('pointercancel', onSheetGrabEnd)
  dragging.value = false
  const { wasClosed, moved } = dragState

  // لمس ساده روی هندل وقتی پنل بسته است → باز کردن
  if (!moved && wasClosed) {
    sheetOpen.value = true
    sheetHeight.value = Math.round(window.innerHeight * 0.42)
    dragState = null
    return
  }

  const vh = window.innerHeight
  const targets = [
    0,
    Math.round(vh * 0.28),
    Math.round(vh * 0.5),
    Math.round(vh * 0.82),
  ]
  sheetHeight.value = targets.reduce((best, t) =>
    Math.abs(t - sheetHeight.value) < Math.abs(best - sheetHeight.value) ? t : best
  )
  if (sheetHeight.value === 0) sheetOpen.value = false
  dragState = null
}
function onWindowResize() {
  if (!isMobile.value || dragState) return
  sheetHeight.value = clampSheet(sheetHeight.value || Math.round(window.innerHeight * 0.42))
}

function toggleQueryPanel() {
  queryPanelOpen.value = !queryPanelOpen.value
  setTimeout(() => mapRef.value?.invalidateSize?.(), 320)
}
function toggleResultsPanel() {
  resultsPanelOpen.value = !resultsPanelOpen.value
  setTimeout(() => mapRef.value?.invalidateSize?.(), 320)
}

// ── مدال لایه‌ها ──
const showLayerModal = ref(false)

function openLayerModal() {
  showLayerModal.value = true
}
async function applyLayerSelection(layers) {
  showLayerModal.value = false
  if (!layers.find(l => l.uuid === activeQueryLayer.value)) {
    activeQueryLayer.value = layers[0]?.uuid ?? null
  }
  await setActiveLayers(layers)
}

function syncViewport(mq) {
  return () => {
    isMobile.value = mq.matches
    if (isMobile.value) {
      queryPanelOpen.value = true
      resultsPanelOpen.value = true
      sheetOpen.value = true
      if (sheetHeight.value === 0) {
        sheetHeight.value = Math.round(window.innerHeight * 0.42)
      }
    }
  }
}

let mq = null
let viewportHandler = null
onMounted(() => {
  // API را بعد از First Paint صدا بزن تا رندر اولیه بلاک نشود (حیاتی برای سیستم ضعیف)
  const idle = window.requestIdleCallback ?? ((cb) => setTimeout(cb, 1))
  idle(() => loadVectorLayers(), { timeout: 2000 })
  // در موبایل پنل‌ها همیشه باز بمانند (دکمه toggle حذف شده)
  mq = window.matchMedia('(max-width: 760px)')
  viewportHandler = syncViewport(mq)
  viewportHandler()
  mq.addEventListener('change', viewportHandler)
  window.addEventListener('resize', onWindowResize)
})
onBeforeUnmount(() => {
  mq?.removeEventListener('change', viewportHandler)
  window.removeEventListener('resize', onWindowResize)
  window.removeEventListener('pointermove', onSheetGrabMove)
  window.removeEventListener('pointerup', onSheetGrabEnd)
  window.removeEventListener('pointercancel', onSheetGrabEnd)
})

// ── جزئیات هر لایه فعال ──
// conditions: پیش‌نویس قابل ویرایش در کوئری‌ساز؛ activeConds: شرط‌های تأییدشده (خلاصه شرط‌ها)
const layerDetails = computed(() => {
  const map = {}
  for (const layer of activeLayers.value) {
    const uuid = layer.uuid
    const draftConds = getLayerConditions(uuid)
    const appliedConds = getAppliedConditions(uuid)
    const name = layer.display_name || layer.name
    map[uuid] = {
      uuid,
      layerUuid: uuid,
      name,
      layerName: name,
      color: layerColor(uuid),
      fields: layerFields(uuid),
      featureCount: layerFeatureCount(uuid),
      resultCount: getLayerResultCount(uuid),
      conditions: draftConds,
      appliedConditions: appliedConds,
      activeConds: appliedConds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined),
    }
  }
  return map
})

const layerQuerySummaries = computed(() =>
  activeLayers.value
    .filter(layer => isLayerVisible(layer.uuid))
    .map(layer => layerDetails.value[layer.uuid])
)

const hasActiveConditions = computed(() =>
  activeLayers.value.some(layer =>
    isLayerVisible(layer.uuid) && layerDetails.value[layer.uuid]?.activeConds.length > 0
  )
)

// ── کوئری مکانی فعال + خلاصه آن برای پنل «شرط‌های فعال» ──
const hasSpatialFilter = computed(() => radiusCenter.value !== null)
const spatialSummaryRadius = computed(() =>
  Number.isFinite(+radiusKm.value) ? Math.round(+radiusKm.value * 10) / 10 : 0
)
const spatialSummaryLabel = computed(() => {
  const c = radiusCenter.value
  if (!c) return ''
  if (c.id != null) {
    const layerName = c._layerName ?? activeLayers.value.find(l => String(l.uuid) === String(c._layerUuid))?.display_name ?? ''
    return layerName ? `عارضه #${c.id} (${layerName})` : `عارضه #${c.id}`
  }
  if (Number.isFinite(+c.lat) && Number.isFinite(+c.lng))
    return `نقطه دلخواه (${(+c.lat).toFixed(4)}، ${(+c.lng).toFixed(4)})`
  return 'مرکز نامشخص'
})

const hiddenLayerUuids = computed(() =>
  activeLayers.value
    .filter(layer => !isLayerVisible(layer.uuid))
    .map(layer => String(layer.uuid))
)

// ── computed های نمایشی ──
const spatialGroupFields = computed(() =>
  queryableFields.value
    .filter(f => f.type === 'string' || f.type === 'enum')
    .map(f => f.key)
)
const showRadiusOnMap = computed(() =>
  queryKind.value === 'spatial' && committedRadiusCenter.value !== null
)
const mapLoading = computed(() => loadingFeatures.value || loadingFields.value)
const displayColumns = computed(() => {
  if (queryKind.value === 'spatial') {
    return [
      { key: '_layerName', label: 'لایه' },
      { key: 'id', label: 'شناسه', mono: true },
      ...queryableFields.value.map(f => ({ key: f.key, label: f.label })),
      { key: 'distanceKm', label: 'فاصله (km)', mono: false },
    ]
  }
  return [
    { key: '_layerName', label: 'لایه' },
    { key: 'id', label: 'شناسه', mono: true },
    ...queryableFields.value.map(f => ({ key: f.key, label: f.label })),
  ]
})
const displayRows = computed(() => combinedResults.value)
const displayLayerMeta = computed(() =>
  activeLayers.value
    .filter(layer => isLayerVisible(layer.uuid))
    .map(layer => ({
      uuid:   layer.uuid,
      name:   layer.display_name || layer.name,
      color:  layerColor(layer.uuid),
      fields: layerFields(layer.uuid),
    }))
)
// کلید یکتا برای هر عارضه (شناسه‌ها ممکن است بین لایه‌ها تکراری باشند)
function rowKey(r) {
  if (!r) return ''
  return r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? '')
}
// سقف ارسال به نقشه برای جلوگیری از فریز روی 100k سطر (کمتر = سریع‌تر روی سیستم ضعیف)
const MAX_HIGHLIGHT = 2000
const highlightedIds = computed(() => combinedResults.value.slice(0, MAX_HIGHLIGHT).map(rowKey))

// لایه‌های مخفی (با آیکون چشم) از روی نقشه حذف می‌شوند؛ ولی داده‌های آن‌ها در نتایج/جدول باقی می‌ماند
const visibleWells = computed(() =>
  allWells.value.filter(w => isLayerVisible(w._layerUuid))
)

// کلید تغییرناپذیر لایه‌های visible — فقط وقتی تغییر می‌کند ریندر نقشه觸مین‌شود
const visibleWellsKey = computed(() =>
  visibleWells.value.map(w => w._layerUuid + ':' + w.id).sort().join('|')
)

// ── handlers ──
function onRemoveLayer(uuid) {
  removeLayer(uuid)
  if (activeQueryLayer.value === uuid) {
    const remaining = activeLayers.value.filter(l => l.uuid !== uuid)
    activeQueryLayer.value = remaining[0]?.uuid ?? null
  }
}
async function onLoadQuery(q) {
  const uuid = await loadSavedQuery(q)
  queryKind.value = 'attribute'
  if (uuid) {
    activeQueryLayer.value = uuid
    queryPanelOpen.value = true
    zoomToResults()
  }
}
function onPickPoint() {
  isPickingPoint.value = true
  // حالت هوشمند: فضای خالی → نقطه دلخواه، عارضه → همان عارضه
  spatialMode.value = 'map'
  mapRef.value?.enablePointPicker(point => {
    customPoint.value = point
    isPickingPoint.value = false
    radiusCenter.value = point
    selectedWellId.value = null
    activeWellId.value = null
  })
}
// مرکز مکانی از لیست یا نقشه (غیر پیکر): انتخاب عارضه نقطه دلخواه قبلی را پاک می‌کند
// همچنین فوری عارضه را مشخص (highlight) می‌کند بدون نیاز به Apply
function onUpdateRadiusCenter(v) {
  radiusCenter.value = v
  if (v && v.id != null) {
    customPoint.value = null
    activeWellId.value = rowKey(v)
    selectedWellId.value = rowKey(v)
  }
}
function onClearPoint() {
  customPoint.value = null
  radiusCenter.value = null
  isPickingPoint.value = false
  mapRef.value?.disablePointPicker()
}
function onClearSpatial() {
  customPoint.value = null
  radiusCenter.value = null
  committedRadiusCenter.value = null
  committedRadiusKm.value = 3
  isPickingPoint.value = false
  mapRef.value?.disablePointPicker()
}
// پاک کردن تمام کوئری‌های فعال (توصیفی همه لایه‌ها + مکانی)
function onClearAllQueries() {
  clearAllConditions()
  onClearSpatial()
}
async function onApplySpatial() {
  await commitSpatialFilter()
  zoomToResults()
}
// اجرای کوئری توصیفی: تأیید پیش‌نویس‌ها و زوم روی نتایج
function onApplyAttribute() {
  applyAttributeConditions()
  zoomToResults()
}
// حذف یک شرط تأییدشده از خلاصه شرط‌ها
function onRemoveAppliedCondition(uuid, index) {
  removeAppliedCondition(uuid, index)
}
// زوم ملایم روی عارضه‌های نتیجه (در صورت خالی بودن، نما تغییر نمی‌کند)
function zoomToResults() {
  const rows = displayRows.value
  if (!rows.length) return
  mapRef.value?.zoomToResults?.(rows)
}
// کلیک روی فضای خالی نقشه → پاک کردن انتخاب عارضه (در هر دو حالت)
function onMapEmptyClick() {
  activeWellId.value = null
  selectedWellId.value = null
  if (queryKind.value === 'spatial') {
    radiusCenter.value = null
    customPoint.value = null
  }
}
function onSelectFromMap(well) {
  activeWellId.value = rowKey(well)
  selectedWellId.value = rowKey(well)
  if (isPickingPoint.value) {
    // در حالت انتخاب از نقشه: کلیک روی عارضه همان عارضه را مرکز می‌کند
    radiusCenter.value = well
    customPoint.value = null
    isPickingPoint.value = false
    mapRef.value?.disablePointPicker()
  } else if (queryKind.value === 'spatial') {
    // راحتی: کلیک عادی روی عارضه در تب مکانی هم آن را مرکز می‌کند
    radiusCenter.value = well
    customPoint.value = null
  }
  mapRef.value?.zoomToFeature(rowKey(well))
}
function onSelectFromTable(row) {
  activeWellId.value = rowKey(row)
  selectedWellId.value = rowKey(row)
  showResultsModal.value = false
  mapRef.value?.zoomToFeature(rowKey(row))
}
function onZoomToLayer(uuid) {
  mapRef.value?.zoomToLayer?.(uuid)
}
function onHoverRow(row) {
  if (!row || row.lat == null || row.lng == null) return
  if (Number.isFinite(+row.lat) && Number.isFinite(+row.lng)) activeWellId.value = rowKey(row)
}
async function handleExport(format) {
  const { exportData } = await import('../composables/useExport.js')
  exportData(format, displayRows.value, convertFeature, { crs: crs.value })
}

function handleClearData() {
  if (!confirm('همه داده‌های ذخیره‌شده (لایه‌های فعال، شرط‌ها، کوئری‌های ذخیره‌شده و تنظیمات) پاک شوند؟')) return
  clearAllLocalData()
  activeQueryLayer.value = null
  showResultsModal.value = false
}
</script>

<style scoped>
.app {
  height: 100vh;
  height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
}

/* ---------- بدنه اصلی ---------- */
.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  padding: 12px;
  min-height: 0;
  background: var(--bg-deep);
}

/* ---------- نقشه ---------- */
.map-panel {
  min-height: 0;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
  position: relative;
  z-index: 0;
  background: var(--bg-panel);
}
.map-loading-overlay {
   position: absolute;
   inset: 0;
   z-index: 400;
   display: flex;
   align-items: center;
   justify-content: center;
   gap: 10px;
   background: rgba(255, 255, 255, 0.85);
   color: var(--text-secondary);
   font-size: 13px;
   font-weight: 600;
   backdrop-filter: blur(4px);
}
.spinner-ring {
   width: 24px;
   height: 24px;
   border: 3px solid var(--border-subtle);
   border-top-color: var(--brand);
   border-radius: 50%;
   animation: spin 0.7s linear infinite;
}
@keyframes spin {
   to { transform: rotate(360deg); }
}

/* ---------- دکمه نتایج ---------- */
.results-fab {
  position: absolute;
  top: 12px;
  inset-inline-end: 12px;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  cursor: pointer;
  white-space: nowrap;
}
.results-fab:hover {
  border-color: var(--brand);
}
.results-fab--active { border-color: var(--brand); }
.results-fab__count {
  background: var(--brand);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 0 8px;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  min-width: 24px;
  text-align: center;
  line-height: 20px;
}

/* ---------- صفحه چینه‌شناسی ---------- */
.strat-page { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* ---------- ریسپانسیو ---------- */
@media (max-width: 1024px) {
  .app-main {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr auto;
  }
  .results-panel {
    grid-column: 1 / -1;
    width: auto !important;
    height: auto;
    max-height: 34vh;
  }
  .results-panel--collapsed {
    width: auto !important;
    height: 36px;
    max-height: 36px;
  }
}

@media (max-width: 760px) {
  .app-main {
    position: relative;
    display: block;
    padding: 0;
    overflow: hidden;
  }
  .map-panel {
    position: absolute;
    inset: 0;
    min-height: 0;
    border-radius: 0;
  }

  /* پنل پایین (bottom sheet) روی نقشه */
  .side-panel,
  .results-panel {
    position: absolute;
    inset-inline: 0;
    bottom: 0;
    width: 100% !important;
    height: var(--sheet-h, 42vh);
    max-height: none;
    min-height: 0;
    border-radius: 16px 16px 0 0;
    box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.28);
    z-index: 30;
  }
  .side-panel {
    padding: 0;
  }
  .results-panel {
    padding: 64px 14px 14px;
  }

  .results-fab { top: 12px; inset-inline-end: 12px; padding: 8px 10px; }
}
</style>

<template>
  <div class="app">
    <AppHeader
      :is-mobile="isMobile"
      :active-layers="activeLayers"
      :loading-layers="loadingLayers"
      :api-error="apiError"
      :query-kind="queryKind"
      :map-provider="mapProvider"
      :crs="crs"
      :theme="theme"
      @update:query-kind="queryKind = $event"
      @update:map-provider="mapProvider = $event"
      @update:crs="crs = $event"
      @toggle-theme="toggleTheme"
      @retry="loadVectorLayers"
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
        :saved-queries="savedQueries"
        @toggle="toggleQueryPanel"
        @update:active-query-layer="activeQueryLayer = $event"
        @add-condition="addLayerCondition"
        @remove-condition="removeLayerCondition"
        @save-query="saveCurrentQuery"
        @update:spatial-mode="spatialMode = $event"
        @update:radius-center="radiusCenter = $event"
        @update:radius-km="radiusKm = $event"
        @pick-point="onPickPoint"
        @clear-point="onClearPoint"
        @clear-spatial="onClearSpatial"
        @load-query="onLoadQuery"
        @delete-query="deleteSavedQuery"
        @clear-data="handleClearData"
      />

      <!-- نقشه + دکمه FAB نتایج -->
      <section class="map-panel">
        <component
          :is="mapProvider === 'mapbox' ? MapboxMap : LeafletMap"
          ref="mapRef"
          :wells="allWells"
          :highlighted-ids="highlightedIds"
          :has-filter="hasAnyFilter"
          :radius-center="showRadiusOnMap ? radiusCenter : null"
          :radius-km="radiusKm"
          :selected-id="selectedWellId"
          :theme="theme"
          @select-well="onSelectFromMap"
        />

        <!-- لودینگ افزودن لایه تا آماده‌شدن نقشه -->
        <div v-if="mapLoading" class="map-loading-overlay">
          <span class="spinner"></span>
          <span>در حال بارگذاری لایه‌ها…</span>
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
        :show-summary="queryKind === 'attribute' && hasActiveConditions"
        @toggle="toggleResultsPanel"
        @open-modal="openLayerModal"
        @remove-layer="onRemoveLayer"
        @zoom-layer="onZoomToLayer"
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
      :open="showLayerModal"
      :layers="vectorLayers"
      :active-layers="activeLayers"
      @close="showLayerModal = false"
      @apply="applyLayerSelection"
    />

    <!-- مودال نتایج تمام‌صفحه -->
    <ResultsModal
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
import QueryPanel from '../components/QueryPanel.vue'
import ResultsPanel from '../components/ResultsPanel.vue'
import LayerModal from '../components/LayerModal.vue'
import ResultsModal from '../components/ResultsModal.vue'
import MobileSheet from '../components/MobileSheet.vue'
import { useWellQuery } from '../composables/useWellQuery.js'
import { useCoordinates } from '../composables/useCoordinates.js'
import { useTheme } from '../composables/useTheme.js'
import { layerColor } from '../composables/useLayerColors.js'
import { useRoute, useRouter } from '../router/index.js'

// بارگذاری تنبل: نقشه‌ها و نمودار چینه‌شناسی فقط هنگام نیاز لود می‌شوند
const MapboxMap = defineAsyncComponent(() => import('../components/MapboxMap.vue'))
const LeafletMap = defineAsyncComponent(() => import('../components/LeafletMap.vue'))
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
  allWells, combinedResults, hasAnyFilter,
  getLayerConditions, addLayerCondition, removeLayerCondition, getLayerResultCount,
  radiusCenter, radiusKm,
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
const spatialMode      = ref('radius')
const mapProvider      = ref('mapbox')
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
  loadVectorLayers()
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
const layerDetails = computed(() => {
  const map = {}
  for (const layer of activeLayers.value) {
    const uuid = layer.uuid
    const allConds = getLayerConditions(uuid)
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
      conditions: allConds,
      activeConds: allConds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined),
    }
  }
  return map
})

const layerQuerySummaries = computed(() =>
  activeLayers.value.map(layer => layerDetails.value[layer.uuid])
)

const hasActiveConditions = computed(() =>
  activeLayers.value.some(layer => layerDetails.value[layer.uuid]?.activeConds.length > 0)
)

// ── computed های نمایشی ──
const spatialGroupFields = computed(() =>
  queryableFields.value
    .filter(f => f.type === 'string' || f.type === 'enum')
    .map(f => f.key)
)
const showRadiusOnMap = computed(() =>
  queryKind.value === 'spatial' && (spatialMode.value === 'radius' || spatialMode.value === 'point')
)
const mapLoading = computed(() => loadingFeatures.value || loadingFields.value)
const displayColumns = computed(() => {
  if (queryKind.value === 'spatial') {
    return [
      { key: '_layerName', label: 'لایه' },
      { key: 'id', label: 'شناسه', mono: true },
      ...queryableFields.value.slice(0, 3).map(f => ({ key: f.key, label: f.label })),
      { key: 'distanceKm', label: 'فاصله (km)', mono: true },
    ]
  }
  return [
    { key: '_layerName', label: 'لایه' },
    { key: 'id', label: 'شناسه', mono: true },
    ...queryableFields.value.slice(0, 5).map(f => ({ key: f.key, label: f.label })),
  ]
})
const displayRows = computed(() => combinedResults.value)
const displayLayerMeta = computed(() => {
  if (queryKind.value !== 'attribute') return []
  return activeLayers.value.map(layer => ({
    uuid:   layer.uuid,
    name:   layer.display_name || layer.name,
    color:  layerColor(layer.uuid),
    fields: layerFields(layer.uuid),
  }))
})
// کلید یکتا برای هر عارضه (شناسه‌ها ممکن است بین لایه‌ها تکراری باشند)
function rowKey(r) {
  if (!r) return ''
  return r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? '')
}
// سقف ارسال به نقشه برای جلوگیری از فریز روی 100k سطر
const MAX_HIGHLIGHT = 5000
const highlightedIds = computed(() => combinedResults.value.slice(0, MAX_HIGHLIGHT).map(rowKey))

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
  }
}
function onPickPoint() {
  isPickingPoint.value = true
  mapRef.value?.enablePointPicker(point => {
    customPoint.value = point
    isPickingPoint.value = false
    radiusCenter.value = point
  })
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
  isPickingPoint.value = false
  mapRef.value?.disablePointPicker()
}
function onSelectFromMap(well) {
  activeWellId.value = rowKey(well)
  selectedWellId.value = rowKey(well)
  if (queryKind.value === 'spatial' && spatialMode.value === 'radius') {
    radiusCenter.value = well
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
  gap: 14px;
  padding: 16px;
  min-height: 0;
}

/* ---------- نقشه ---------- */
.map-panel {
  min-height: 0;
  border-radius: var(--radius-lg);
  position: relative;
  z-index: 0;
}
.map-loading-overlay {
  position: absolute;
  inset: 0;
  z-index: 400;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  background: color-mix(in srgb, var(--bg-panel) 55%, transparent);
  backdrop-filter: blur(3px);
  border-radius: var(--radius-lg);
  color: var(--text-secondary);
  font-size: 13px;
  font-weight: 600;
}

/* ---------- دکمه FAB نتایج ---------- */
.results-fab {
  position: absolute;
  top: 20px;
  inset-inline-end: 20px;
  z-index: 500;
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 11px;
  font-weight: 600;
  padding: 10px 10px;
  border-radius: 10px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.3);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.results-fab:hover {
  background: var(--bg-panel-raised);
  box-shadow: 0 4px 20px rgba(0,0,0,0.4);
}
.results-fab--active { border-color: var(--accent-depth); }
.results-fab__icon { font-size: 16px; line-height: 1; }
.results-fab__count {
  background: var(--accent-depth);
  color: #fff;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  border-radius: 20px;
  font-family: var(--font-mono);
  min-width: 24px;
  text-align: center;
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

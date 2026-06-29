<template>
  <div class="app">
    <!-- نوار بالایی -->
    <header class="app-header">
      <div class="app-header__brand">
        <div class="brand-mark">🗺</div>
        <div>
          <h1>واکاوی لایه‌های مکانی</h1>
          <p>پرسش و استعلام از داده‌های توصیفی و مکانی ژئوباکس</p>
        </div>
      </div>

      <!-- نمایش خلاصه لایه‌های فعال در هدر -->
      <div class="header-layer-summary">
        <span class="layer-summary-label">لایه‌های فعال:</span>
        <span v-if="activeLayers.length === 0" class="layer-summary-empty">انتخاب نشده</span>
        <span v-else class="layer-summary-count">{{ activeLayers.length }} لایه</span>
        <span v-if="loadingLayers" class="spinner-inline"></span>
        <div v-if="apiError" class="layer-error">{{ apiError }}</div>
      </div>

      <nav class="app-header__tabs">
        <button
          v-for="tab in tabs"
          :key="tab.id"
          class="header-tab"
          :class="{ 'header-tab--active': queryKind === tab.id }"
          @click="queryKind = tab.id"
        >
          {{ tab.label }}
        </button>
      </nav>

      <div class="app-header__map-switch">
        <button class="map-switch-btn" :class="{ 'map-switch-btn--active': mapProvider === 'leaflet' }" @click="mapProvider = 'leaflet'">Leaflet</button>
        <button class="map-switch-btn" :class="{ 'map-switch-btn--active': mapProvider === 'mapbox' }" @click="mapProvider = 'mapbox'">Mapbox</button>
      </div>

      <div class="app-header__crs-switch">
        <button class="map-switch-btn" :class="{ 'map-switch-btn--active': crs === 'wgs84' }" @click="crs = 'wgs84'">WGS84</button>
        <button class="map-switch-btn" :class="{ 'map-switch-btn--active': crs === 'utm' }" @click="crs = 'utm'">UTM</button>
      </div>
    </header>

    <!-- حالت بارگذاری -->
    <div v-if="loadingFeatures || loadingFields" class="loading-state">
      <div class="spinner"></div>
      <p>{{ loadingFields ? "دریافت فیلدها…" : "دریافت عارضه‌ها…" }}</p>
    </div>

    <!-- صفحه چینه‌شناسی -->
    <div v-else-if="queryKind === 'stratigraphy'" class="strat-page">
      <StratigraphyChart />
    </div>

    <!-- صفحه اصلی — همیشه نمایش داده می‌شه -->
    <main v-else class="app-main">
      <aside class="side-panel">
        <div class="side-panel__scroll">
          <QueryBuilder
            v-if="queryKind === 'attribute'"
            :conditions="conditions"
            :fields="queryableFields"
            :result-count="attributeResults.length"
            :total-count="allWells.length"
            @add="addCondition"
            @remove="removeCondition"
            @save="saveCurrentQuery"
          />
          <SpatialQueryPanel
            v-else
            v-model:mode="spatialMode"
            :wells="allWells"
            :radius-center="radiusCenter"
            v-model:radiusKm="radiusKm"
            :fields="spatialGroupFields"
            :custom-point="customPoint"
            :is-picking="isPickingPoint"
            @update:radiusCenter="radiusCenter = $event"
            @pick-point="onPickPoint"
            @clear-point="onClearPoint"
          />
          <div class="side-divider"></div>
          <SavedQueries :queries="savedQueries" @load="onLoadQuery" @delete="deleteSavedQuery" />
        </div>
      </aside>

      <section class="map-panel">
        <component
          :is="mapProvider === 'mapbox' ? MapboxMap : LeafletMap"
          ref="mapRef"
          :wells="allWells"
          :highlighted-ids="highlightedIds"
          :radius-center="showRadiusOnMap ? radiusCenter : null"
          :radius-km="radiusKm"
          :neighbor-pairs="queryKind === 'spatial' && spatialMode === 'neighbor' ? neighborResults : []"
          @select-well="onSelectFromMap"
        />
      </section>

      <!-- پنل نتایج: ۷۰٪ جدول + ۳۰٪ لایه‌ها -->
      <section class="results-panel" :class="{ 'results-panel--collapsed': !resultsPanelOpen }">
        <button class="results-toggle" @click="toggleResultsPanel">
          {{ resultsPanelOpen ? "◀" : "▶" }}
        </button>

        <div class="results-panel__content" v-show="resultsPanelOpen">
          <div class="results-split">
            <!-- ۷۰٪ - جدول نتایج -->
            <div class="results-main">
              <ResultsTable
                :rows="displayRows"
                :columns="displayColumns"
                :active-id="activeWellId"
                @select="onSelectFromTable"
                @hover="onHoverRow"
                @export="handleExport"
              />
            </div>

            <!-- ۳۰٪ - لیست لایه‌های فعال -->
            <div class="results-layers">
              <div class="layers-header">
                <span class="layers-title">لایه‌های فعال</span>
                <button class="add-layer-btn" @click="openLayerModal" :disabled="loadingLayers">
                  <span>+</span> افزودن لایه
                </button>
              </div>

              <div v-if="loadingLayers" class="layers-loading">
                <span class="spinner-inline"></span>
                <span>در حال بارگذاری…</span>
              </div>

              <ul v-else class="active-layers-list">
                <li
                  v-for="layer in activeLayers"
                  :key="layer.uuid"
                  class="active-layer-item"
                >
                  <div class="active-layer-info">
                    <span class="active-layer-dot" :style="{ background: layerColor(layer.uuid) }"></span>
                    <span class="active-layer-name">{{ layer.display_name || layer.name }}</span>
                  </div>
                  <div class="active-layer-meta">
                    <span class="active-layer-count">{{ layerFeatureCount(layer.uuid) }} عارضه</span>
                    <button class="remove-layer-btn" @click="removeLayer(layer.uuid)" title="حذف لایه">×</button>
                  </div>
                </li>

                <li v-if="activeLayers.length === 0" class="no-layer-item">
                  <span>لایه‌ای انتخاب نشده</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>
    </main>

    <!-- مدال انتخاب لایه -->
    <teleport to="body">
      <div v-if="showLayerModal" class="modal-backdrop" @click.self="showLayerModal = false">
        <div class="layer-modal">
          <div class="modal-header">
            <h3>انتخاب لایه‌ها</h3>
            <button class="modal-close" @click="showLayerModal = false">×</button>
          </div>

          <div class="modal-search">
            <input
              v-model="layerSearch"
              placeholder="جستجو در لایه‌ها…"
              class="modal-search-input"
            />
          </div>

          <div class="modal-layer-list-wrap">
            <ul class="modal-layer-list">
              <li
                v-for="layer in filteredModalLayers"
                :key="layer.uuid"
                class="modal-layer-item"
                :class="{ 'modal-layer-item--checked': tempSelected.includes(layer.uuid) }"
                @click="toggleTempLayer(layer.uuid)"
              >
                <div class="modal-checkbox">
                  <span v-if="tempSelected.includes(layer.uuid)" class="checkbox-check">✓</span>
                </div>
                <div class="modal-layer-info">
                  <span class="modal-layer-name">{{ layer.display_name || layer.name }}</span>
                  <span class="modal-layer-meta">{{ layer.layer_type }} · {{ layer.feature_count }} عارضه</span>
                </div>
              </li>
              <li v-if="filteredModalLayers.length === 0" class="modal-empty">
                نتیجه‌ای یافت نشد
              </li>
            </ul>
          </div>

          <div class="modal-footer">
            <span class="modal-selected-count">{{ tempSelected.length }} لایه انتخاب شده</span>
            <div class="modal-actions">
              <button class="btn-cancel" @click="showLayerModal = false">انصراف</button>
              <button class="btn-apply" @click="applyLayerSelection">اعمال</button>
            </div>
          </div>
        </div>
      </div>
    </teleport>
  </div>
</template>

<script setup>
import { ref, computed, shallowRef, onMounted } from 'vue'
import LeafletMap from './components/LeafletMap.vue'
import MapboxMap from './components/MapboxMap.vue'
import QueryBuilder from './components/QueryBuilder.vue'
import SpatialQueryPanel from './components/SpatialQueryPanel.vue'
import ResultsTable from './components/ResultsTable.vue'
import SavedQueries from './components/SavedQueries.vue'
import StratigraphyChart from './components/StratigraphyChart.vue'
import { useWellQuery } from './composables/useWellQuery.js'
import { useCoordinates } from './composables/useCoordinates.js'
import { exportData } from './composables/useExport.js'

const { crs, convertFeature } = useCoordinates()

const {
  vectorLayers, activeLayers, selectedLayer,
  layerFeaturesMap: _layerFeaturesMap,
  queryableFields,
  loadingLayers, loadingFields, loadingFeatures, apiError,
  loadVectorLayers,
  addLayer, removeLayer, setActiveLayers,
  allWells, conditions, attributeResults,
  addCondition, removeCondition,
  radiusCenter, radiusKm, radiusResults, neighborResults,
  savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
} = useWellQuery()

// چون layerFeaturesMap یه ref({}) هست، در template باید از این helper استفاده کنیم
function layerFeatureCount(uuid) {
  return (_layerFeaturesMap.value?.[uuid] ?? []).length
}

const tabs = [
  { id: 'attribute',    label: 'کوئری توصیفی' },
  { id: 'spatial',      label: 'کوئری مکانی' },
  { id: 'stratigraphy', label: 'چینه‌شناسی' },
]

const queryKind        = ref('attribute')
const spatialMode      = ref('radius')
const mapProvider      = ref('mapbox')
const mapRef           = shallowRef(null)
const activeWellId     = ref(null)
const resultsPanelOpen = ref(true)
const customPoint      = ref(null)
const isPickingPoint   = ref(false)

// ── مدال لایه‌ها ──
const showLayerModal = ref(false)
const tempSelected   = ref([])   // uuid های انتخاب‌شده موقت در مدال
const layerSearch    = ref('')

// رنگ‌های ثابت برای هر لایه (بر اساس uuid)
const LAYER_COLORS = ['#2a9d8f','#e9c46a','#f4a261','#e76f51','#264653','#a8dadc','#457b9d','#e63946']
function layerColor(uuid) {
  const idx = (vectorLayers.value.findIndex(l => l.uuid === uuid) ?? 0) % LAYER_COLORS.length
  return LAYER_COLORS[Math.max(0, idx)]
}

const filteredModalLayers = computed(() => {
  const q = layerSearch.value.toLowerCase().trim()
  if (!q) return vectorLayers.value
  return vectorLayers.value.filter(l =>
    (l.display_name || l.name || '').toLowerCase().includes(q)
  )
})

function openLayerModal() {
  // لایه‌های فعلاً انتخاب‌شده رو تیک‌دار کن
  tempSelected.value = activeLayers.value.map(l => l.uuid)
  layerSearch.value = ''
  showLayerModal.value = true
}

function toggleTempLayer(uuid) {
  const idx = tempSelected.value.indexOf(uuid)
  if (idx >= 0) {
    tempSelected.value = tempSelected.value.filter(u => u !== uuid)
  } else {
    tempSelected.value = [...tempSelected.value, uuid]
  }
}

async function applyLayerSelection() {
  showLayerModal.value = false
  const layers = vectorLayers.value.filter(l => tempSelected.value.includes(l.uuid))
  await setActiveLayers(layers)
}

onMounted(loadVectorLayers)

// ── computed ──────────────────────────────────────────────

const spatialGroupFields = computed(() =>
  queryableFields.value
    .filter(f => f.type === 'string' || f.type === 'enum')
    .map(f => f.key)
)

const showRadiusOnMap = computed(() =>
  queryKind.value === 'spatial' && (spatialMode.value === 'radius' || spatialMode.value === 'point')
)

const displayColumns = computed(() => {
  if (queryKind.value === 'spatial') {
    if (spatialMode.value === 'neighbor') {
      return [
        { key: 'pairLabel', label: 'جفت عارضه‌ها' },
        { key: 'distanceKm', label: 'فاصله (km)', mono: true },
      ]
    }
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

const displayRows = computed(() => {
  if (queryKind.value === 'attribute') return attributeResults.value
  if (spatialMode.value === 'neighbor') {
    return neighborResults.value.map((pair, i) => ({
      id: `pair-${i}`,
      pairLabel: `${pair.a.id}  ⇄  ${pair.b.id}`,
      distanceKm: pair.distanceKm,
    }))
  }
  return radiusResults.value
})

const highlightedIds = computed(() => {
  if (queryKind.value === 'attribute') return attributeResults.value.map(w => w.id)
  if (spatialMode.value === 'neighbor') {
    const ids = new Set()
    neighborResults.value.forEach(p => { ids.add(p.a.id); ids.add(p.b.id) })
    return [...ids]
  }
  return radiusResults.value.map(w => w.id)
})

// ── handlers ──────────────────────────────────────────────

function onLoadQuery(q) {
  loadSavedQuery(q)
  queryKind.value = 'attribute'
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

function toggleResultsPanel() {
  resultsPanelOpen.value = !resultsPanelOpen.value
  setTimeout(() => mapRef.value?.invalidateSize?.(), 320)
}

function onSelectFromMap(well) {
  activeWellId.value = well.id
  if (queryKind.value === 'spatial' && spatialMode.value === 'radius') {
    radiusCenter.value = well
  }
  mapRef.value?.zoomToFeature(well.id)
}

function onSelectFromTable(row) {
  activeWellId.value = row.id
  mapRef.value?.zoomToFeature(row.id)
}

function onHoverRow(row) {
  if (row.lat && row.lng) activeWellId.value = row.id
}

function handleExport(format) {
  exportData(format, displayRows.value, convertFeature)
}
</script>

<style scoped>
.app {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: var(--bg-deep);
}

/* ---------- هدر ---------- */
.app-header {
  display: flex;
  align-items: center;
  gap: 20px;
  padding: 12px 20px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.app-header__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-md);
  background: linear-gradient(155deg, var(--accent-depth), #2a6b60);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
}
.app-header__brand h1 {
  margin: 0;
  font-size: 14.5px;
  font-weight: 800;
}
.app-header__brand p {
  margin: 1px 0 0;
  font-size: 11px;
  color: var(--text-muted);
}

/* ---------- خلاصه لایه‌ها در هدر ---------- */
.header-layer-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  font-size: 12.5px;
  min-width: 160px;
}
.layer-summary-label {
  color: var(--text-muted);
  font-size: 11px;
}
.layer-summary-empty {
  color: var(--text-muted);
  font-style: italic;
}
.layer-summary-count {
  color: var(--accent-depth);
  font-weight: 700;
}
.layer-error {
  font-size: 11px;
  color: var(--accent-danger);
}

/* ---------- تب‌ها ---------- */
.app-header__tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.header-tab {
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 7px 16px;
  border-radius: var(--radius-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.header-tab:hover:not(.header-tab--active) {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}
.header-tab--active {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--border-strong);
}

.app-header__map-switch {
  margin-inline-start: auto;
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.app-header__crs-switch {
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.map-switch-btn {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 11.5px;
  font-family: var(--font-mono);
  padding: 6px 12px;
  border-radius: var(--radius-sm);
  direction: ltr;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.map-switch-btn:hover:not(.map-switch-btn--active) {
  background: var(--bg-panel-raised);
  color: var(--text-secondary);
}
.map-switch-btn--active {
  background: var(--accent-depth);
  color: #fff;
  font-weight: 700;
}

/* ---------- اسپینر ---------- */
.loading-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: var(--text-muted);
}
.spinner,
.spinner-inline {
  border: 2px solid var(--border-strong);
  border-top-color: var(--accent-depth);
  border-radius: 50%;
  animation: spin 0.7s linear infinite;
}
.spinner { width: 36px; height: 36px; }
.spinner-inline { width: 14px; height: 14px; flex-shrink: 0; display: inline-block; }
@keyframes spin { to { transform: rotate(360deg); } }

/* ---------- بدنه اصلی ---------- */
.app-main {
  flex: 1;
  display: grid;
  grid-template-columns: 320px 1fr auto;
  gap: 14px;
  padding: 14px;
  min-height: 0;
}

.side-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  min-height: 0;
  overflow: hidden;
}
.side-panel__scroll {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.side-divider {
  height: 1px;
  background: var(--border-subtle);
}

/* ---------- پنل نتایج ---------- */
.results-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 14px;
  min-height: 0;
  overflow: hidden;
  position: relative;
  transition: width 0.3s ease;
  width: 320px;
}
.results-panel--collapsed {
  width: 32px;
  padding: 0;
}

.results-toggle {
  position: absolute;
  top: 50%;
  right: 0px;
  transform: translateY(-50%);
  width: 28px;
  height: 48px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md) 0 0 var(--radius-md);
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: -2px 0 8px rgba(0, 0, 0, 0.08);
  cursor: pointer;
}
.results-toggle:hover {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}

.results-panel__content {
  height: 100%;
  overflow: hidden;
}

/* ---------- تقسیم ۷۰/۳۰ ---------- */
.results-split {
  display: flex;
  flex-direction: column;
  height: 100%;
  gap: 0;
}

.results-main {
  flex: 7;
  min-height: 0;
  overflow: hidden;
  border-bottom: 1px solid var(--border-subtle);
  padding-bottom: 10px;
  margin-bottom: 10px;
}

.results-layers {
  flex: 3;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

/* ---------- لیست لایه‌های فعال ---------- */
.layers-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}
.layers-title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.add-layer-btn {
  display: flex;
  align-items: center;
  gap: 4px;
  background: var(--accent-depth);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 5px 12px;
  font-size: 11.5px;
  font-family: inherit;
  cursor: pointer;
  transition: opacity 0.15s;
}
.add-layer-btn:hover:not(:disabled) { opacity: 0.85; }
.add-layer-btn:disabled { opacity: 0.5; cursor: not-allowed; }

.layers-loading {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font-size: 12px;
  padding: 8px 0;
}

.active-layers-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 5px;
  overflow-y: auto;
}

.active-layer-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  transition: border-color 0.15s;
}
.active-layer-item:hover { border-color: var(--border-strong); }

.active-layer-info {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.active-layer-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.active-layer-name {
  font-size: 12px;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.active-layer-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
}
.active-layer-count {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}
.remove-layer-btn {
  width: 20px;
  height: 20px;
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 14px;
  line-height: 1;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  transition: background 0.15s, color 0.15s;
}
.remove-layer-btn:hover {
  background: var(--accent-danger, #e74c3c);
  color: #fff;
  border-color: transparent;
}

.no-layer-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 16px;
  color: var(--text-muted);
  font-size: 12px;
  font-style: italic;
  text-align: center;
}
.add-layer-btn-empty {
  background: var(--accent-depth);
  color: #fff;
  border: none;
  border-radius: var(--radius-sm);
  padding: 6px 16px;
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
  font-style: normal;
}

/* ---------- نقشه ---------- */
.map-panel {
  min-height: 0;
  border-radius: var(--radius-lg);
  position: relative;
  z-index: 0;
}

.strat-page {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* ---------- مدال ---------- */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}

.layer-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  width: 440px;
  max-height: 75vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
  overflow: hidden;
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.modal-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}
.modal-close {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-size: 20px;
  cursor: pointer;
  width: 28px;
  height: 28px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s;
}
.modal-close:hover {
  background: var(--bg-input);
  color: var(--text-primary);
}

.modal-search {
  padding: 12px 20px;
  flex-shrink: 0;
  border-bottom: 1px solid var(--border-subtle);
}
.modal-search-input {
  width: 100%;
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 13px;
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-family: inherit;
  box-sizing: border-box;
}
.modal-search-input:focus {
  outline: none;
  border-color: var(--accent-depth);
}

.modal-layer-list-wrap {
  flex: 1;
  overflow-y: auto;
  padding: 10px 12px;
}

.modal-layer-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.modal-layer-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;
  user-select: none;
}
.modal-layer-item:hover {
  background: var(--bg-input);
}
.modal-layer-item--checked {
  background: color-mix(in srgb, var(--accent-depth) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent-depth) 40%, transparent);
}

.modal-checkbox {
  width: 18px;
  height: 18px;
  border: 2px solid var(--border-strong);
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: var(--bg-input);
  transition: background 0.12s, border-color 0.12s;
}
.modal-layer-item--checked .modal-checkbox {
  background: var(--accent-depth);
  border-color: var(--accent-depth);
}
.checkbox-check {
  color: #fff;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}

.modal-layer-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.modal-layer-name {
  font-size: 13px;
  color: var(--text-primary);
  font-weight: 500;
}
.modal-layer-meta {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.modal-empty {
  padding: 24px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
}

.modal-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.modal-selected-count {
  font-size: 12px;
  color: var(--text-muted);
}
.modal-actions {
  display: flex;
  gap: 8px;
}
.btn-cancel {
  padding: 8px 18px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--bg-input);
  color: var(--text-primary);
  font-size: 13px;
  font-family: inherit;
  cursor: pointer;
  transition: background 0.15s;
}
.btn-cancel:hover { background: var(--bg-panel-raised); }

.btn-apply {
  padding: 8px 22px;
  border-radius: var(--radius-sm);
  border: none;
  background: var(--accent-depth);
  color: #fff;
  font-size: 13px;
  font-family: inherit;
  font-weight: 700;
  cursor: pointer;
  transition: opacity 0.15s;
}
.btn-apply:hover { opacity: 0.88; }

/* ---------- ریسپانسیو ---------- */
@media (max-width: 1180px) {
  .app-main {
    grid-template-columns: 280px 1fr;
    grid-template-rows: 1fr 340px;
  }
  .results-panel {
    grid-column: 1 / -1;
    width: auto !important;
  }
  .results-split {
    flex-direction: row;
  }
  .results-main {
    border-bottom: none;
    border-left: 1px solid var(--border-subtle);
    padding-bottom: 0;
    margin-bottom: 0;
    padding-left: 10px;
    margin-left: 10px;
  }
}
</style>

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

    <!-- صفحه چینه‌شناسی -->
    <div v-if="queryKind === 'stratigraphy'" class="strat-page">
      <StratigraphyChart />
    </div>

    <!-- صفحه اصلی -->
    <main v-else class="app-main">

      <!-- پنل چپ: کوئری‌ساز -->
      <aside class="side-panel" :class="{ 'side-panel--collapsed': !queryPanelOpen }">
        <button class="query-toggle" @click="toggleQueryPanel">
          {{ queryPanelOpen ? "◀" : "▶" }}
        </button>
        <div class="side-panel__scroll" v-show="queryPanelOpen">
          <div v-if="queryKind === 'attribute'" class="per-layer-qb">
            <div v-if="loadingFeatures || loadingFields" class="qb-loading">
              <span class="spinner-inline"></span>
              <span>{{ loadingFields ? "دریافت فیلدها…" : "دریافت عارضه‌ها…" }}</span>
            </div>

            <div v-else-if="activeLayers.length === 0" class="qb-no-layer">
              ابتدا یک لایه از پنل راست اضافه کنید
            </div>

            <template v-else>
              <div class="layer-dropdown-wrap">
                <label class="layer-dropdown-label">لایه فعال</label>
                <div class="layer-dropdown-select-wrap">
                  <span class="layer-dropdown-dot" :style="{ background: layerColor(activeQueryLayer) }"></span>
                  <select
                    class="layer-dropdown-select"
                    :value="activeQueryLayer"
                    @change="activeQueryLayer = $event.target.value"
                  >
                    <option v-for="layer in activeLayers" :key="layer.uuid" :value="layer.uuid">
                      {{ layer.display_name || layer.name }}
                    </option>
                  </select>
                </div>
              </div>

              <template v-for="layer in activeLayers" :key="layer.uuid">
                <QueryBuilder
                  v-if="activeQueryLayer === layer.uuid"
                  :conditions="getLayerConditions(layer.uuid)"
                  :fields="layerFields(layer.uuid)"
                  :result-count="getLayerResultCount(layer.uuid)"
                  :total-count="layerFeatureCount(layer.uuid)"
                  @add="addLayerCondition(layer.uuid)"
                  @remove="removeLayerCondition(layer.uuid, $event)"
                  @save="saveCurrentQuery"
                />
              </template>
            </template>
          </div>

          <SpatialQueryPanel
            v-else-if="queryKind === 'spatial'"
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
          :neighbor-pairs="queryKind === 'spatial' && spatialMode === 'neighbor' ? neighborResults : []"
          @select-well="onSelectFromMap"
        />

        <!-- دکمه نمایش نتایج -->
        <button
          class="results-fab"
          :class="{ 'results-fab--active': displayRows.length > 0 }"
          @click="showResultsModal = true"
        >
          <span class="results-fab__label">نمایش نتایج</span>
          <span class="results-fab__count" v-if="displayRows.length > 0">{{ displayRows.length }}</span>
        </button>
      </section>

      <!-- پنل راست: لایه‌ها + خلاصه شرط‌ها -->
      <section class="results-panel" :class="{ 'results-panel--collapsed': !resultsPanelOpen }">
        <button class="results-toggle" @click="toggleResultsPanel">
          {{ resultsPanelOpen ? "◀" : "▶" }}
        </button>

        <div class="results-panel__content" v-show="resultsPanelOpen">

          <!-- لیست لایه‌های فعال -->
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
                  <button class="remove-layer-btn" @click="onRemoveLayer(layer.uuid)" title="حذف لایه">×</button>
                </div>
              </li>
              <li v-if="activeLayers.length === 0" class="no-layer-item">
                <span>لایه‌ای انتخاب نشده</span>
              </li>
            </ul>
          </div>

          <!-- خلاصه شرط‌های فعال -->
          <div
            class="query-summary-panel"
            v-if="queryKind === 'attribute' && hasActiveConditions"
          >
            <div class="qs-panel-title">شرط‌های فعال</div>

            <div
              v-for="item in layerQuerySummaries"
              :key="item.layerUuid"
              class="qs-layer-block"
            >
              <template v-if="item.activeConds.length > 0">
                <div class="qs-layer-name">
                  <span class="qs-dot" :style="{ background: item.color }"></span>
                  <span>{{ item.layerName }}</span>
                  <span class="qs-count-badge">{{ item.activeConds.length }}</span>
                </div>
                <div
                  v-for="(cond, idx) in item.activeConds"
                  :key="idx"
                  class="qs-cond-row"
                >
                  <span v-if="idx > 0" class="qs-cond-logic">{{ cond.logic }}</span>
                  <span v-if="cond.not" class="qs-cond-not">NOT</span>
                  <span class="qs-cond-field">{{ item.fields.find(f => f.key === cond.field)?.label ?? cond.field }}</span>
                  <span class="qs-cond-op">{{ opSymbol(cond.operator) }}</span>
                  <span class="qs-cond-val">{{ cond.value }}</span>
                </div>
              </template>
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

      <!-- مودال نتایج تمام‌صفحه -->
      <div v-if="showResultsModal" class="results-modal-backdrop" @click.self="showResultsModal = false">
        <div class="results-modal">
          <div class="results-modal__header">
            <div class="results-modal__title">
              نتایج
              <span class="results-modal__count mono">{{ displayRows.length }} رکورد</span>
            </div>
            <div class="results-modal__exports">
              <button class="export-btn" @click="handleExport('geojson')">GeoJSON</button>
              <button class="export-btn" @click="handleExport('csv')">CSV</button>
              <button class="export-btn" @click="handleExport('kml')">KML</button>
              <button class="export-btn" @click="handleExport('kmz')">KMZ</button>
              <button class="export-btn" @click="handleExport('shp')">SHP</button>
              <button class="export-btn" @click="handleExport('dxf')">DXF</button>
            </div>
            <button class="results-modal__close" @click="showResultsModal = false">×</button>
          </div>

          <div class="results-modal__body">
            <ResultsTable
              :rows="displayRows"
              :columns="displayColumns"
              :layer-meta="displayLayerMeta"
              :active-id="activeWellId"
              @select="onSelectFromTable"
              @hover="onHoverRow"
              @export="handleExport"
            />
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
  layerFieldsMap: _layerFieldsMap,
  layerFeaturesMap: _layerFeaturesMap,
  queryableFields,
  loadingLayers, loadingFields, loadingFeatures, apiError,
  loadVectorLayers,
  addLayer, removeLayer, setActiveLayers,
  allWells, conditions, attributeResults, combinedResults, hasAnyFilter,
  addCondition, removeCondition,
  layerConditions,
  getLayerConditions, addLayerCondition, removeLayerCondition, getLayerResultCount,
  radiusCenter, radiusKm, radiusResults, neighborResults,
  savedQueries, saveCurrentQuery, loadSavedQuery, deleteSavedQuery,
} = useWellQuery()

function layerFeatureCount(uuid) {
  return (_layerFeaturesMap.value?.[uuid] ?? []).length
}
function layerFields(uuid) {
  return _layerFieldsMap.value?.[uuid] ?? []
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
const activeQueryLayer = ref(null)
const queryPanelOpen   = ref(true)
const showResultsModal = ref(false)

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
const tempSelected   = ref([])
const layerSearch    = ref('')

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
  tempSelected.value = activeLayers.value.map(l => l.uuid)
  layerSearch.value = ''
  showLayerModal.value = true
}
function toggleTempLayer(uuid) {
  const idx = tempSelected.value.indexOf(uuid)
  if (idx >= 0) tempSelected.value = tempSelected.value.filter(u => u !== uuid)
  else tempSelected.value = [...tempSelected.value, uuid]
}
function applyLayerSelection() {
  showLayerModal.value = false
  const layers = vectorLayers.value.filter(l => tempSelected.value.includes(l.uuid))
  if (!layers.find(l => l.uuid === activeQueryLayer.value)) {
    activeQueryLayer.value = layers[0]?.uuid ?? null
  }
  setActiveLayers(layers)
}

onMounted(loadVectorLayers)

// ── خلاصه شرط‌ها ──
const OP_SYMBOLS = { '=':'=', '!=':'≠', '>':'>', '>=':'≥', '<':'<', '<=':'≤', contains:'شامل' }
function opSymbol(op) { return OP_SYMBOLS[op] ?? op }

const layerQuerySummaries = computed(() =>
  activeLayers.value.map(layer => {
    const allConds = getLayerConditions(layer.uuid)
    return {
      layerUuid:   layer.uuid,
      layerName:   layer.display_name || layer.name,
      color:       layerColor(layer.uuid),
      fields:      layerFields(layer.uuid),
      activeConds: allConds.filter(c => c.value !== '' && c.value !== null && c.value !== undefined),
    }
  })
)

const hasActiveConditions = computed(() =>
  layerQuerySummaries.value.some(l => l.activeConds.length > 0)
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
  if (spatialMode.value === 'neighbor') {
    return neighborResults.value.map((pair, i) => ({
      id: `pair-${i}`,
      pairLabel: `${pair.a.id}  ⇄  ${pair.b.id}`,
      distanceKm: pair.distanceKm,
    }))
  }
  return combinedResults.value
})
const displayLayerMeta = computed(() => {
  if (queryKind.value !== 'attribute') return []
  return activeLayers.value.map(layer => ({
    uuid:   layer.uuid,
    name:   layer.display_name || layer.name,
    color:  layerColor(layer.uuid),
    fields: layerFields(layer.uuid),
  }))
})
const highlightedIds = computed(() => {
  if (spatialMode.value === 'neighbor') {
    const ids = new Set()
    neighborResults.value.forEach(p => { ids.add(p.a.id); ids.add(p.b.id) })
    return [...ids]
  }
  return combinedResults.value.map(w => w.id)
})

// ── handlers ──
function onRemoveLayer(uuid) {
  removeLayer(uuid)
  if (activeQueryLayer.value === uuid) {
    const remaining = activeLayers.value.filter(l => l.uuid !== uuid)
    activeQueryLayer.value = remaining[0]?.uuid ?? null
  }
}
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
.layer-summary-label { color: var(--text-muted); font-size: 11px; }
.layer-summary-empty { color: var(--text-muted); font-style: italic; }
.layer-summary-count { color: var(--accent-depth); font-weight: 700; }
.layer-error { font-size: 11px; color: var(--accent-danger); }

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
  grid-template-columns: auto 1fr auto;
  gap: 14px;
  padding: 14px;
  min-height: 0;
}

/* ---------- پنل چپ ---------- */
.side-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  min-height: 0;
  overflow: hidden;
  position: relative;
  transition: width 0.3s ease;
  width: 320px;
}
.side-panel--collapsed { width: 32px; padding: 0; }
.query-toggle {
  position: absolute;
  top: 50%;
  left: 0px;
  transform: translateY(-50%);
  width: 28px;
  height: 48px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: 0 var(--radius-md) var(--radius-md) 0;
  color: var(--text-secondary);
  font-size: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: 2px 0 8px rgba(0,0,0,0.08);
  cursor: pointer;
}
.query-toggle:hover {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}
.side-panel__scroll {
  height: 100%;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

/* ---------- دراپ‌داون لایه ---------- */
.layer-dropdown-wrap { display: flex; flex-direction: column; gap: 5px; }
.layer-dropdown-label {
  font-size: 11px; font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase; letter-spacing: 0.04em;
}
.layer-dropdown-select-wrap {
  display: flex; align-items: center; gap: 8px;
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 0 10px;
}
.layer-dropdown-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.layer-dropdown-select {
  flex: 1; background: transparent; border: none;
  color: var(--text-primary); font-size: 12.5px;
  font-family: inherit; padding: 8px 0; cursor: pointer; outline: none; min-width: 0;
}
.side-divider { height: 1px; background: var(--border-subtle); }

/* ---------- نقشه ---------- */
.map-panel {
  min-height: 0;
  border-radius: var(--radius-lg);
  position: relative;
  z-index: 0;
}

/* ---------- دکمه FAB نتایج ---------- */
.results-fab {
  position: absolute;
  top: 15px;
  left: 10%;
  transform: translateX(-50%);
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
  box-shadow: 0 2px 20px rgba(0,0,0,0.3);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s, border-color 0.15s;
  white-space: nowrap;
}
.results-fab:hover {
  background: var(--bg-panel-raised);
  box-shadow: 0 4px 25px rgba(0,0,0,0.4);
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

/* ---------- پنل راست ---------- */
.results-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 14px;
  min-height: 0;
  overflow: hidden;
  position: relative;
  transition: width 0.3s ease;
  width: 270px;
}
.results-panel--collapsed { width: 32px; padding: 0; }
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
  box-shadow: -2px 0 8px rgba(0,0,0,0.08);
  cursor: pointer;
}
.results-toggle:hover {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}
.results-panel__content {
  height: 100%;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 14px;
}

/* ---------- لیست لایه‌ها ---------- */
.results-layers { display: flex; flex-direction: column; gap: 8px; }
.layers-header { display: flex; justify-content: space-between; align-items: center; flex-shrink: 0; }
.layers-title { font-size: 12px; font-weight: 700; color: var(--text-secondary); }
.add-layer-btn {
  display: flex; align-items: center; gap: 4px;
  background: var(--accent-depth); color: #fff;
  border: none; border-radius: var(--radius-sm);
  padding: 5px 12px; font-size: 11.5px;
  font-family: inherit; cursor: pointer;
  transition: opacity 0.15s;
}
.add-layer-btn:hover:not(:disabled) { opacity: 0.85; }
.add-layer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.layers-loading { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 12px; padding: 8px 0; }
.active-layers-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 5px; overflow-y: auto;
}
.active-layer-item {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  transition: border-color 0.15s;
}
.active-layer-item:hover { border-color: var(--border-strong); }
.active-layer-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.active-layer-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.active-layer-name {
  font-size: 12px; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.active-layer-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.active-layer-count { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.remove-layer-btn {
  width: 20px; height: 20px;
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 14px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0; transition: background 0.15s, color 0.15s;
}
.remove-layer-btn:hover {
  background: var(--accent-danger, #e74c3c);
  color: #fff; border-color: transparent;
}
.no-layer-item {
  display: flex; flex-direction: column; align-items: center;
  gap: 10px; padding: 16px; color: var(--text-muted);
  font-size: 12px; font-style: italic; text-align: center;
}

/* ---------- خلاصه شرط‌ها ---------- */
.query-summary-panel {
  display: flex;
  flex-direction: column;
  gap: 8px;
  border-top: 1px solid var(--border-subtle);
  padding-top: 12px;
}
.qs-panel-title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.qs-layer-block {
  display: flex;
  flex-direction: column;
  gap: 5px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 9px 11px;
}
.qs-layer-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-primary);
  margin-bottom: 2px;
}
.qs-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
.qs-count-badge {
  margin-right: auto;
  background: color-mix(in srgb, var(--accent-depth) 18%, transparent);
  color: var(--accent-depth);
  font-size: 10px;
  font-weight: 700;
  padding: 1px 6px;
  border-radius: 20px;
}
.qs-cond-row {
  display: flex;
  align-items: center;
  gap: 5px;
  flex-wrap: wrap;
  font-size: 11.5px;
  padding: 3px 0;
  border-top: 1px solid var(--border-subtle);
}
.qs-cond-logic { color: var(--accent-depth); font-weight: 700; font-size: 10px; }
.qs-cond-not   { color: #e76f51; font-weight: 700; font-size: 10px; }
.qs-cond-field { color: var(--text-primary); font-weight: 600; }
.qs-cond-op    { color: var(--text-muted); font-size: 12px; }
.qs-cond-val {
  color: var(--accent-copper-bright);
  background: color-mix(in srgb, var(--accent-copper) 14%, transparent);
  padding: 1px 7px;
  border-radius: 4px;
  font-size: 11px;
  font-family: var(--font-mono);
}

/* ---------- کوئری per-layer ---------- */
.per-layer-qb { display: flex; flex-direction: column; gap: 12px; }
.qb-loading { display: flex; align-items: center; gap: 10px; padding: 16px 0; color: var(--text-muted); font-size: 12px; }
.qb-no-layer { font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px 0; font-style: italic; }

/* ---------- صفحه چینه‌شناسی ---------- */
.strat-page { flex: 1; overflow: hidden; display: flex; flex-direction: column; }

/* ---------- مدال لایه‌ها ---------- */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.6);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(2px);
}
.layer-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  width: 440px; max-height: 75vh;
  display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
  overflow: hidden;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 18px 20px 14px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.modal-header h3 { margin: 0; font-size: 15px; font-weight: 700; }
.modal-close {
  background: transparent; border: none; color: var(--text-muted);
  font-size: 20px; cursor: pointer;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-sm);
  transition: background 0.15s, color 0.15s;
}
.modal-close:hover { background: var(--bg-input); color: var(--text-primary); }
.modal-search { padding: 12px 20px; flex-shrink: 0; border-bottom: 1px solid var(--border-subtle); }
.modal-search-input {
  width: 100%; background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-primary); font-size: 13px;
  padding: 8px 12px; border-radius: var(--radius-sm);
  font-family: inherit; box-sizing: border-box;
}
.modal-search-input:focus { outline: none; border-color: var(--accent-depth); }
.modal-layer-list-wrap {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 10px 12px;
  -webkit-overflow-scrolling: touch;
  will-change: scroll-position;
  overscroll-behavior: contain;
}
.modal-layer-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 4px; }
.modal-layer-item {
  display: flex; align-items: center; gap: 12px;
  padding: 10px 12px; border-radius: var(--radius-sm);
  cursor: pointer; border: 1px solid transparent;
  transition: background 0.12s, border-color 0.12s;
  user-select: none;
}
.modal-layer-item:hover { background: var(--bg-input); }
.modal-layer-item--checked {
  background: color-mix(in srgb, var(--accent-depth) 12%, transparent);
  border-color: color-mix(in srgb, var(--accent-depth) 40%, transparent);
}
.modal-checkbox {
  width: 18px; height: 18px;
  border: 2px solid var(--border-strong);
  border-radius: 4px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; background: var(--bg-input);
  transition: background 0.12s, border-color 0.12s;
}
.modal-layer-item--checked .modal-checkbox { background: var(--accent-depth); border-color: var(--accent-depth); }
.checkbox-check { color: #fff; font-size: 12px; font-weight: 700; line-height: 1; }
.modal-layer-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.modal-layer-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.modal-layer-meta { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.modal-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
.modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 20px 18px;
  border-top: 1px solid var(--border-subtle); flex-shrink: 0;
}
.modal-selected-count { font-size: 12px; color: var(--text-muted); }
.modal-actions { display: flex; gap: 8px; }
.btn-cancel {
  padding: 8px 18px; border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--bg-input); color: var(--text-primary);
  font-size: 13px; font-family: inherit; cursor: pointer;
  transition: background 0.15s;
}
.btn-cancel:hover { background: var(--bg-panel-raised); }
.btn-apply {
  padding: 8px 22px; border-radius: var(--radius-sm);
  border: none; background: var(--accent-depth); color: #fff;
  font-size: 13px; font-family: inherit; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s;
}
.btn-apply:hover { opacity: 0.88; }

/* ---------- مودال نتایج تمام‌صفحه ---------- */
.results-modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.65);
  z-index: 2000;
  display: flex; align-items: center; justify-content: center;
  padding: 24px;
  backdrop-filter: blur(3px);
  overscroll-behavior: contain;
}
.results-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  width: 100%; max-width: 1300px;
  height: 90vh;
  display: flex; flex-direction: column;
  overflow: hidden;
  box-shadow: 0 32px 80px rgba(0,0,0,0.55);
}
.results-modal__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px 22px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.results-modal__title {
  font-size: 16px; font-weight: 700;
  color: var(--text-primary);
  display: flex; align-items: baseline; gap: 10px;
  white-space: nowrap;
}
.results-modal__count {
  font-size: 12px;
  color: var(--accent-depth);
}
.results-modal__exports {
  display: flex; gap: 6px; flex-wrap: wrap;
  margin-right: auto;
}
.export-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 11px; font-family: var(--font-mono);
  padding: 6px 12px; border-radius: var(--radius-sm); cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.export-btn:hover { border-color: var(--accent-copper); color: var(--accent-copper-bright); }
.results-modal__close {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-size: 20px;
  width: 34px; height: 34px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s;
}
.results-modal__close:hover { color: var(--accent-danger); border-color: var(--accent-danger); }
.results-modal__body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 22px;
  -webkit-overflow-scrolling: touch;
  will-change: scroll-position;
}

/* ---------- ریسپانسیو ---------- */
@media (max-width: 1180px) {
  .app-main {
    grid-template-columns: auto 1fr;
    grid-template-rows: 1fr auto;
  }
  .results-panel {
    grid-column: 1 / -1;
    width: auto !important;
    height: auto;
  }
}
</style>
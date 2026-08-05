<template>
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

    <SegmentedControl
      class="app-header__tabs"
      :model-value="queryKind"
      :options="tabs"
      @update:model-value="$emit('update:query-kind', $event)"
    />

    <SegmentedControl
      class="app-header__map-switch"
      size="sm"
      :model-value="mapProvider"
      :options="mapOptions"
      @update:model-value="$emit('update:map-provider', $event)"
    />

    <SegmentedControl
      class="app-header__crs-switch"
      size="sm"
      :model-value="crs"
      :options="crsOptions"
      @update:model-value="$emit('update:crs', $event)"
    />

    <button
      class="theme-toggle"
      :class="{ 'theme-toggle--dark': theme === 'dark' }"
      @click="$emit('toggle-theme')"
      :title="theme === 'dark' ? 'حالت روشن' : 'حالت تیره'"
      aria-label="تغییر تم"
    >
      <span class="theme-toggle__icon">
        <svg
          v-if="theme === 'dark'"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
        <svg
          v-else
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z" />
        </svg>
      </span>
    </button>
  </header>
</template>

<script setup>
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps({
  activeLayers: { type: Array, default: () => [] },
  loadingLayers: { type: Boolean, default: false },
  apiError: { type: String, default: '' },
  queryKind: { type: String, required: true },
  mapProvider: { type: String, required: true },
  crs: { type: String, required: true },
  theme: { type: String, required: true },
})
defineEmits(['update:query-kind', 'update:map-provider', 'update:crs', 'toggle-theme'])

const tabs = [
  { value: 'attribute',    label: 'کوئری توصیفی' },
  { value: 'spatial',      label: 'کوئری مکانی' },
  { value: 'stratigraphy', label: 'چینه‌شناسی' },
]
const mapOptions = [
  { value: 'leaflet', label: 'Leaflet' },
  { value: 'mapbox',  label: 'Mapbox' },
]
const crsOptions = [
  { value: 'wgs84', label: 'WGS84' },
  { value: 'utm',   label: 'UTM' },
]
</script>

<style scoped>
/* ---------- هدر ---------- */
.app-header {
  position: sticky;
  top: 0;
  z-index: 900;
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 20px;
  background: color-mix(in srgb, var(--bg-panel) 88%, transparent);
  backdrop-filter: blur(14px) saturate(1.4);
  border-bottom: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-sm);
  flex-shrink: 0;
  flex-wrap: wrap;
}
.app-header__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 38px;
  height: 38px;
  border-radius: var(--radius-md);
  background: linear-gradient(155deg, var(--accent-depth), #235c50);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 17px;
  flex-shrink: 0;
  box-shadow: var(--shadow-sm);
  color: #fff;
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
  padding: 7px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  font-size: 12.5px;
  min-width: 160px;
  max-width: 240px;
}
.layer-summary-label { color: var(--text-muted); font-size: 11px; }
.layer-summary-empty { color: var(--text-muted); font-style: italic; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.layer-summary-count { color: var(--accent-depth); font-weight: 700; }
.layer-error { font-size: 11px; color: var(--accent-danger); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

.app-header__map-switch {
  margin-inline-start: auto;
}

.theme-toggle {
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: all var(--dur-fast) var(--ease-out);
}
.theme-toggle:hover {
  border-color: var(--accent-depth);
  color: var(--accent-depth);
  background: color-mix(in srgb, var(--accent-depth) 8%, var(--bg-input));
}
.theme-toggle:active {
  transform: scale(0.9) rotate(-12deg);
}
.theme-toggle__icon {
  display: inline-flex;
}
.theme-toggle--dark {
  color: var(--accent-amber);
}

/* ---------- ریسپانسیو هدر ---------- */
@media (max-width: 1240px) {
  .app-header {
    gap: 10px;
  }
  .app-header__brand p { display: none; }
  .layer-summary-empty,
  .layer-summary-count { white-space: nowrap; }
}

@media (max-width: 1024px) {
  .app-header {
    row-gap: 8px;
  }
  .app-header__brand { min-width: 0; }
  .app-header__brand h1 {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

@media (max-width: 760px) {
  .app-header {
    padding: 8px 12px;
    gap: 6px;
    align-items: center;
  }
  .app-header__brand {
    flex: 1 1 auto;
    min-width: 0;
  }
  .app-header__brand h1 { font-size: 13px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brand-mark { width: 32px; height: 32px; font-size: 14px; }

  .header-layer-summary {
    min-width: 0;
    max-width: 120px;
    padding: 6px 10px;
    font-size: 11px;
  }
  .layer-summary-label { display: none; }

  .theme-toggle { order: 2; }
  .app-header__crs-switch { order: 3; }
  .app-header__map-switch { order: 4; }
  .app-header__tabs { order: 5; width: 100%; }
}

@media (max-width: 520px) {
  .app-header__crs-switch { display: none; }
}

@media (max-width: 460px) {
  .header-layer-summary { display: none; }
  .theme-toggle { width: 32px; height: 32px; }
}
</style>

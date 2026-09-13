<template>
  <header class="app-header" :class="{ 'app-header--collapsed': isMobile && collapsed }">
    <!-- نوار بالای هدر: در موبایل همیشه دیده می‌شود -->
    <div class="app-header__topbar">
      <button
        v-if="isMobile"
        class="app-header__collapse"
        :class="{ 'is-collapsed': collapsed }"
        @click="collapsed = !collapsed"
        :title="collapsed ? 'باز کردن هدر' : 'بستن هدر'"
        aria-label="جمع یا باز کردن هدر"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <polyline points="18 15 12 9 6 15" />
        </svg>
      </button>

      <div class="app-header__brand">
        <div class="brand-mark" aria-hidden="true">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
            <path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" />
            <path d="M9 4v14M15 6v14" />
          </svg>
        </div>
        <div class="brand-text">
          <h1>واکاوی لایه‌های مکانی</h1>
          <p>سامانه استعلام توصیفی و مکانی ژئوباکس</p>
        </div>
      </div>
    </div>

    <!-- محتوای قابل جمع‌شدن -->
    <div class="app-header__body" :class="{ 'is-collapsed': collapsed }">
      <div class="app-header__body-inner">
        <div class="header-layer-summary">
          <span class="layer-summary-label">لایه‌های فعال:</span>
          <span v-if="activeLayers.length === 0" class="layer-summary-empty">انتخاب نشده</span>
          <span v-else class="layer-summary-count">{{ activeLayers.length.toLocaleString('fa-IR') }} لایه</span>
          <span v-if="loadingLayers" class="spinner-inline" role="status" aria-label="در حال بارگذاری"></span>
          <div v-if="apiError" class="layer-error" :title="apiError">{{ apiError }}
            <button class="retry-btn" @click="$emit('retry')">تلاش مجدد</button>
          </div>
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
      </div>
    </div>
  </header>
</template>

<script setup>
import { ref } from 'vue'
import SegmentedControl from './SegmentedControl.vue'

const props = defineProps({
  activeLayers: { type: Array, default: () => [] },
  loadingLayers: { type: Boolean, default: false },
  apiError: { type: String, default: '' },
  queryKind: { type: String, required: true },
  mapProvider: { type: String, required: true },
  crs: { type: String, required: true },
  theme: { type: String, required: true },
  isMobile: { type: Boolean, default: false },
})
defineEmits(['update:query-kind', 'update:map-provider', 'update:crs', 'toggle-theme', 'retry'])

const collapsed = ref(false)

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
  gap: 12px;
  min-height: var(--header-h);
  padding: 8px 16px;
  background: var(--bg-panel);
  border-bottom: 1px solid var(--border-subtle);
  box-shadow: var(--shadow-xs);
  flex-shrink: 0;
  flex-wrap: wrap;
}

/* نوار بالا و بدنه، در دسکتاپ محتوایشان را داخل flex هدر می‌ریزند */
.app-header__topbar,
.app-header__body {
  display: contents;
}

/* در دسکتاپ، کنترل‌ها داخل بدنه باید در یک ردیف قرار بگیرند */
.app-header__body-inner {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1 1 auto;
  min-width: 0;
}

.app-header__brand {
  display: flex;
  align-items: center;
  gap: 10px;
}
.brand-mark {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-sm);
  background: var(--brand);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #fff;
}
.brand-text h1 {
  margin: 0;
  font-size: 13.5px;
  font-weight: 700;
  letter-spacing: -0.01em;
}
.brand-text p {
  margin: 0;
  font-size: 11px;
  color: var(--text-muted);
}

.header-layer-summary {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 12px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 12px;
  min-width: 150px;
  max-width: 240px;
}
.layer-summary-label { color: var(--text-muted); font-size: 11px; }
.layer-summary-empty { color: var(--text-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.layer-summary-count { color: var(--brand); font-weight: 700; font-family: var(--font-mono); font-size: 12px; }
.layer-error { font-size: 11px; color: var(--accent-danger); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; display: flex; align-items: center; gap: 6px; }
.retry-btn {
  background: var(--bg-panel); border: 1px solid var(--accent-danger); color: var(--accent-danger);
  font-size: 11px; font-weight: 600; font-family: inherit; padding: 2px 10px; border-radius: var(--radius-xs); cursor: pointer; flex-shrink: 0;
}
.retry-btn:hover { background: var(--accent-danger); color: #fff; }

.app-header__map-switch {
  margin-inline-start: auto;
}

/* ---------- دکمه جمع/باز کردن هدر (موبایل) ---------- */
.app-header__collapse {
  display: none;
}
.app-header__collapse svg {
  transition: transform 0.25s var(--ease-out);
}
.app-header__collapse.is-collapsed svg {
  transform: rotate(180deg);
}

.theme-toggle {
  width: 34px;
  height: 34px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-secondary);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out), background var(--dur-fast) var(--ease-out);
}
.theme-toggle:hover {
  border-color: var(--border-strong);
  color: var(--text-primary);
  background: var(--bg-panel-raised);
}
.theme-toggle:active {
  transform: scale(0.96);
}
.theme-toggle__icon {
  display: inline-flex;
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
    align-items: stretch;
    flex-direction: column;
  }

  /* نوار بالا: دکمه جمع + برند */
  .app-header__topbar {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .app-header__collapse {
    display: inline-flex;
    width: 30px;
    height: 30px;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    border-radius: var(--radius-xs);
    flex-shrink: 0;
    cursor: pointer;
  }
  .app-header__collapse:hover {
    color: var(--text-primary);
    border-color: var(--border-strong);
  }

  .app-header__brand {
    flex: 1 1 auto;
    min-width: 0;
  }
  .brand-text h1 { font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .brand-mark { width: 30px; height: 30px; }

  /* بدنه قابل جمع‌شدن */
  .app-header__body {
    display: grid;
    grid-template-rows: 1fr;
    transition: grid-template-rows var(--dur-base) var(--ease-out);
  }
  .app-header__body.is-collapsed {
    grid-template-rows: 0fr;
  }
  .app-header__body-inner {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    min-height: 0;
    overflow: hidden;
  }

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

.app-header--collapsed {
  gap: 0;
}

@media (max-width: 520px) {
  .app-header__crs-switch { display: none; }
}

@media (max-width: 460px) {
  .header-layer-summary { display: none; }
  .theme-toggle { width: 32px; height: 32px; }
}
</style>

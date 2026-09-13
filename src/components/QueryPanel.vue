<template>
  <aside class="side-panel" :class="{ 'side-panel--collapsed': !open }">
    <button class="query-toggle" @click="$emit('toggle')" aria-label="جمع یا باز کردن پنل کوئری">
      <svg
        class="toggle-chevron"
        :class="{ 'is-closed': !open }"
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2.4"
        stroke-linecap="round"
        stroke-linejoin="round"
        style="transform: scaleX(-1)"
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>
    <div class="side-panel__scroll" v-show="open">
      <div v-if="queryKind === 'attribute'" class="per-layer-qb">
        <div v-if="loadingFeatures || loadingFields" class="qb-loading" role="status">
          <span class="spinner-inline"></span>
          <span>{{ loadingFields ? "دریافت فیلدها…" : "دریافت عارضه‌ها…" }}</span>
        </div>

        <div v-else-if="layers.length === 0" class="qb-no-layer">
          ابتدا یک لایه از پنل چپ اضافه کنید
        </div>

        <template v-else>
          <div class="layer-dropdown-wrap">
            <label class="layer-dropdown-label">لایه فعال</label>
            <div class="layer-dropdown-select-wrap">
              <span class="layer-dropdown-dot" :style="{ background: activeLayerColor }"></span>
              <AppSelect
                class="layer-dropdown-select"
                :model-value="activeQueryLayer"
                :options="layerOptions"
                placeholder="انتخاب لایه…"
                @update:model-value="$emit('update:active-query-layer', $event)"
              />
            </div>
          </div>

          <template v-for="layer in layers" :key="layer.uuid">
            <QueryBuilder
              v-if="activeQueryLayer === layer.uuid"
              :conditions="layerDetails[layer.uuid]?.conditions ?? []"
              :fields="layerDetails[layer.uuid]?.fields ?? []"
              :result-count="layerDetails[layer.uuid]?.resultCount ?? 0"
              :total-count="layerDetails[layer.uuid]?.featureCount ?? 0"
              @add="$emit('add-condition', layer.uuid)"
              @remove="$emit('remove-condition', layer.uuid, $event)"
              @save="$emit('save-query', $event, layer.uuid)"
            />
          </template>
        </template>
      </div>

      <SpatialQueryPanel
        v-else-if="queryKind === 'spatial'"
        :mode="spatialMode"
        :wells="wells"
        :radius-center="radiusCenter"
        :radius-km="radiusKm"
        :fields="spatialGroupFields"
        :custom-point="customPoint"
        :is-picking="isPickingPoint"
        @update:mode="$emit('update:spatial-mode', $event)"
        @update:radius-center="$emit('update:radius-center', $event)"
        @update:radius-km="$emit('update:radius-km', $event)"
        @pick-point="$emit('pick-point')"
        @clear-point="$emit('clear-point')"
        @clear-spatial="$emit('clear-spatial')"
      />
      <div class="side-divider"></div>
      <SavedQueries :queries="savedQueries" @load="$emit('load-query', $event)" @delete="$emit('delete-query', $event)" />

      <button class="clear-data-btn" @click="$emit('clear-data')" title="پاک کردن همه داده‌های ذخیره‌شده">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14z" />
        </svg>
        پاک کردن داده‌ها
      </button>
    </div>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import QueryBuilder from './QueryBuilder.vue'
import SpatialQueryPanel from './SpatialQueryPanel.vue'
import SavedQueries from './SavedQueries.vue'
import AppSelect from './AppSelect.vue'

const props = defineProps({
  open: { type: Boolean, default: true },
  queryKind: { type: String, required: true },
  layers: { type: Array, default: () => [] },
  layerDetails: { type: Object, default: () => ({}) },
  activeQueryLayer: { type: String, default: null },
  loadingFields: { type: Boolean, default: false },
  loadingFeatures: { type: Boolean, default: false },
  spatialMode: { type: String, required: true },
  wells: { type: Array, default: () => [] },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, required: true },
  spatialGroupFields: { type: Array, default: () => [] },
  customPoint: { type: Object, default: null },
  isPickingPoint: { type: Boolean, default: false },
  savedQueries: { type: Array, default: () => [] },
})
defineEmits([
  'toggle',
  'update:active-query-layer',
  'add-condition',
  'remove-condition',
  'save-query',
  'update:spatial-mode',
  'update:radius-center',
  'update:radius-km',
  'pick-point',
  'clear-point',
  'clear-spatial',
  'load-query',
  'delete-query',
  'clear-data',
])

const activeLayerColor = computed(() =>
  props.layerDetails[props.activeQueryLayer]?.color ?? '#2a9d8f'
)

const layerOptions = computed(() =>
  props.layers.map((layer) => ({
    value: layer.uuid,
    label: layer.display_name || layer.name,
  }))
)
</script>

<style scoped>
/* ---------- پنل چپ ---------- */
.side-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  min-height: 0;
  overflow: hidden;
  position: relative;
  transition: width var(--dur-base) var(--ease-out);
  width: 320px;
  box-shadow: var(--shadow-xs);
  display: flex;
  flex-direction: column;
}
.side-panel--collapsed { width: 36px; padding: 0; }
.query-toggle {
  position: absolute;
  top: 50%;
  left: -1px;
  transform: translateY(-50%);
  width: 22px;
  height: 48px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-inline-start: none;
  border-radius: 0 var(--radius-xs) var(--radius-xs) 0;
  color: var(--text-muted);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  cursor: pointer;
}
.query-toggle:hover {
  color: var(--brand);
  background: var(--bg-hover);
}
.toggle-chevron {
  transition: transform 0.3s var(--ease-out);
}
.toggle-chevron.is-closed {
  transform: rotate(180deg);
}
.side-panel__scroll {
  flex: 1;
  min-height: 0;
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
  letter-spacing: 0.02em;
}
.layer-dropdown-select-wrap {
  display: flex; align-items: center; gap: 8px;
}
.layer-dropdown-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.layer-dropdown-select {
  flex: 1; min-width: 0;
}
.side-divider { height: 1px; background: var(--border-subtle); }

/* ---------- کوئری per-layer ---------- */
.per-layer-qb { display: flex; flex-direction: column; gap: 12px; }
.qb-loading { display: flex; align-items: center; gap: 10px; padding: 16px 0; color: var(--text-muted); font-size: 12px; }
.qb-no-layer { font-size: 12px; color: var(--text-muted); text-align: center; padding: 20px 0; font-style: italic; }

.clear-data-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  margin-top: auto;
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  white-space: nowrap;
}
.clear-data-btn:hover {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}

/* ---------- ریسپانسیو ---------- */
@media (max-width: 760px) {
  .side-panel__scroll {
    padding: 64px 16px 16px;
  }
  .query-toggle {
    display: none;
  }
}
</style>

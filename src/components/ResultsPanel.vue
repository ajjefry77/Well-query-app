<template>
  <section class="results-panel" :class="{ 'results-panel--collapsed': !open }">
    <button class="results-toggle" @click="$emit('toggle')">
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
      >
        <polyline points="15 18 9 12 15 6" />
      </svg>
    </button>

    <div class="results-panel__content" v-show="open">

      <!-- لیست لایه‌های فعال -->
      <div class="results-layers">
        <div class="layers-header">
          <span class="layers-title">لایه‌های فعال</span>
          <button class="add-layer-btn" @click="$emit('open-modal')" :disabled="loadingLayers">
            <span>+</span> افزودن لایه
          </button>
        </div>

        <div v-if="loadingLayers" class="layers-loading">
          <span class="spinner-inline"></span>
          <span>در حال بارگذاری…</span>
        </div>

        <ul v-else class="active-layers-list">
          <li
            v-for="layer in layers"
            :key="layer.uuid"
            class="active-layer-item"
            @click="$emit('zoom-layer', layer.uuid)"
            title="برای زوم روی لایه کلیک کنید"
          >
            <div class="active-layer-info">
              <span class="active-layer-dot" :style="{ background: detailByUuid[layer.uuid]?.color ?? '#2a9d8f' }"></span>
              <span class="active-layer-name">{{ layer.display_name || layer.name }}</span>
            </div>
            <div class="active-layer-meta">
              <span class="active-layer-count">{{ detailByUuid[layer.uuid]?.featureCount ?? 0 }} عارضه</span>
              <button class="remove-layer-btn" @click.stop="$emit('remove-layer', layer.uuid)" title="حذف لایه">×</button>
            </div>
          </li>
          <li v-if="layers.length === 0" class="no-layer-item">
            <span>لایه‌ای انتخاب نشده</span>
          </li>
        </ul>
      </div>

      <!-- خلاصه شرط‌های فعال -->
      <div
        class="query-summary-panel"
        v-if="showSummary"
      >
        <div class="qs-panel-title">شرط‌های فعال</div>

        <div
          v-for="item in summaries"
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
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: true },
  layers: { type: Array, default: () => [] },
  loadingLayers: { type: Boolean, default: false },
  summaries: { type: Array, default: () => [] },
  showSummary: { type: Boolean, default: false },
})
defineEmits(['toggle', 'open-modal', 'remove-layer', 'zoom-layer'])

const OP_SYMBOLS = { '=':'=', '!=':'≠', '>':'>', '>=':'≥', '<':'<', '<=':'≤', contains:'شامل' }
function opSymbol(op) { return OP_SYMBOLS[op] ?? op }

const detailByUuid = computed(() => {
  const map = {}
  for (const s of props.summaries) map[s.layerUuid] = s
  return map
})
</script>

<style scoped>
/* ---------- پنل راست ---------- */
.results-panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  padding: 14px;
  min-height: 0;
  overflow: hidden;
  position: relative;
  transition: width 0.3s var(--ease-out);
  width: 270px;
  box-shadow: var(--shadow-sm);
  display: flex;
  flex-direction: column;
}
.results-panel--collapsed { width: 36px; padding: 0; }
.results-toggle {
  position: absolute;
  top: 50%;
  right: -11px;
  transform: translateY(-50%);
  width: 28px;
  height: 28px;
  background: var(--bg-panel-raised);
  border: none;
  border-radius: 50%;
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10;
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition: background 0.15s, color 0.15s, transform 0.15s;
}
.results-toggle:hover {
  background: color-mix(in srgb, var(--accent-depth) 12%, var(--bg-panel-raised));
  color: var(--accent-depth);
  transform: translateY(-50%) scale(1.08);
}
.toggle-chevron {
  transition: transform 0.3s var(--ease-out);
}
.toggle-chevron.is-closed {
  transform: rotate(180deg);
}
.results-panel__content {
  flex: 1;
  min-height: 0;
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
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  color: var(--accent-depth);
  border-radius: var(--radius-full);
  padding: 6px 14px; font-size: 11.5px;
  font-weight: 700;
  font-family: inherit; cursor: pointer;
  transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s;
}
.add-layer-btn:hover:not(:disabled) {
  background: color-mix(in srgb, var(--accent-depth) 10%, var(--bg-input));
  border-color: var(--accent-depth);
  color: var(--accent-depth);
}
.add-layer-btn:active:not(:disabled) { transform: scale(0.96); }
.add-layer-btn:disabled { opacity: 0.5; cursor: not-allowed; }
.layers-loading { display: flex; align-items: center; gap: 8px; color: var(--text-muted); font-size: 12px; padding: 8px 0; }
.active-layers-list {
  list-style: none; margin: 0; padding: 0;
  display: flex; flex-direction: column; gap: 6px; overflow-y: auto;
}
.active-layer-item {
  display: flex; align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s, transform 0.1s;
}
.active-layer-item:hover { border-color: var(--border-strong); background: var(--bg-hover); }
.active-layer-info { display: flex; align-items: center; gap: 8px; min-width: 0; }
.active-layer-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; box-shadow: 0 0 0 2px var(--bg-input); }
.active-layer-name {
  font-size: 12px; color: var(--text-primary);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.active-layer-meta { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
.active-layer-count { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.remove-layer-btn {
  width: 22px; height: 22px;
  background: transparent;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 14px; line-height: 1; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  padding: 0; transition: background 0.15s, color 0.15s, border-color 0.15s;
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

/* ---------- ریسپانسیو ---------- */
@media (max-width: 1024px) {
  .results-panel--collapsed .results-toggle {
    position: absolute;
    top: 50%;
    right: 50%;
    transform: translate(50%, -50%);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-full);
  }
}

@media (max-width: 760px) {
  .results-toggle {
    display: none;
  }
}
</style>

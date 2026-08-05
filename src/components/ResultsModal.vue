<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="results-modal-backdrop" @click.self="$emit('close')">
        <div class="results-modal">
          <div class="results-modal__header">
<div class="results-modal__title">
               نتایج
               <span class="results-modal__count mono">{{ rows.length }} رکورد</span>
             </div>
             <button class="results-modal__close" @click="$emit('close')">×</button>
          </div>

          <div class="results-modal__body">
            <ResultsTable
              :rows="rows"
              :columns="columns"
              :layer-meta="layerMeta"
              :active-id="activeId"
              @select="$emit('select', $event)"
              @hover="$emit('hover', $event)"
              @export="$emit('export', $event)"
            />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import ResultsTable from './ResultsTable.vue'

const EXPORT_FORMATS = ['geojson', 'csv', 'kml', 'kmz', 'shp', 'dxf']

defineProps({
  open: { type: Boolean, default: false },
  rows: { type: Array, default: () => [] },
  columns: { type: Array, default: () => [] },
  layerMeta: { type: Array, default: () => [] },
  activeId: { type: [String, Number], default: null },
})
defineEmits(['close', 'select', 'hover'])
</script>

<style scoped>
.results-modal-backdrop {
  position: fixed; inset: 0;
  background: color-mix(in srgb, var(--bg-deep) 55%, rgba(0,0,0,0.55));
  display: flex; align-items: center; justify-content: center;
  z-index: 2000;
  backdrop-filter: blur(6px);
  padding: 24px;
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
  box-shadow: var(--shadow-lg);
}
.results-modal__header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 22px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
  flex-wrap: wrap;
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
  padding: 6px 12px; border-radius: var(--radius-full); cursor: pointer;
  transition: border-color 0.15s, color 0.15s, background 0.15s, transform 0.1s;
}
.export-btn:hover {
  border-color: var(--accent-copper);
  color: var(--accent-copper-bright);
  background: color-mix(in srgb, var(--accent-copper) 10%, var(--bg-input));
}
.export-btn:active { transform: scale(0.95); }
.results-modal__close {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-size: 20px;
  width: 36px; height: 36px;
  border-radius: var(--radius-full);
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  transition: color 0.15s, border-color 0.15s, transform 0.1s;
}
.results-modal__close:hover { color: var(--accent-danger); border-color: var(--accent-danger); transform: rotate(90deg); }
.results-modal__body {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 16px 22px;
  -webkit-overflow-scrolling: touch;
  will-change: scroll-position;
}

/* ---------- انیمیشن مودال ---------- */
.modal-enter-active { transition: opacity 0.28s var(--ease-out); }
.modal-leave-active { transition: opacity 0.2s var(--ease-out); }
.modal-enter-active .results-modal {
  transition: transform 0.28s var(--ease-out);
}
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .results-modal {
  transform: translateY(16px) scale(0.97);
}
.modal-leave-to .results-modal {
  transform: translateY(8px) scale(0.99);
}

@media (max-width: 760px) {
  .results-modal-backdrop { padding: 0; }
  .results-modal {
    width: 100%;
    height: 100%;
    max-height: 100%;
    border-radius: 0;
    border: none;
  }
  .results-modal__header { padding: 10px 14px; }
  .results-modal__body { padding: 12px; }
  .export-btn { font-size: 10px; padding: 5px 9px; }
}
</style>

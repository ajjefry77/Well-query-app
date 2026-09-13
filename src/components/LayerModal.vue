<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="open" class="modal-backdrop" @click.self="$emit('close')">
        <div class="layer-modal">
          <div class="modal-header">
            <h3>انتخاب لایه‌ها</h3>
            <button class="modal-close" @click="$emit('close')">×</button>
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
              <button class="btn-cancel" @click="$emit('close')">انصراف</button>
              <button class="btn-apply" @click="applySelection">اعمال</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  open: { type: Boolean, default: false },
  layers: { type: Array, default: () => [] },
  activeLayers: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'apply'])

const tempSelected = ref([])
const layerSearch  = ref('')

watch(() => props.open, (val) => {
  if (val) {
    tempSelected.value = props.activeLayers.map(l => l.uuid)
    layerSearch.value = ''
  }
})

const filteredModalLayers = computed(() => {
  const q = layerSearch.value.toLowerCase().trim()
  if (!q) return props.layers
  return props.layers.filter(l =>
    (l.display_name || l.name || '').toLowerCase().includes(q)
  )
})

function toggleTempLayer(uuid) {
  const idx = tempSelected.value.indexOf(uuid)
  if (idx >= 0) tempSelected.value = tempSelected.value.filter(u => u !== uuid)
  else tempSelected.value = [...tempSelected.value, uuid]
}

function applySelection() {
  emit('apply', props.layers.filter(l => tempSelected.value.includes(l.uuid)))
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(15, 25, 33, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
}
.layer-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  width: 460px; max-width: calc(100vw - 32px);
  max-height: 78vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
  flex-shrink: 0;
}
.modal-header h3 { margin: 0; font-size: 13.5px; font-weight: 700; }
.modal-close {
  background: transparent; border: 1px solid transparent; color: var(--text-muted);
  font-size: 18px; cursor: pointer;
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-xs);
}
.modal-close:hover { background: var(--bg-panel-raised); color: var(--text-primary); }
.modal-search { padding: 10px 16px; flex-shrink: 0; border-bottom: 1px solid var(--border-subtle); background: var(--bg-panel-raised); }
.modal-search-input {
  width: 100%; background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-primary); font-size: 12.5px;
  padding: 8px 10px; border-radius: var(--radius-sm);
  font-family: inherit; box-sizing: border-box;
}
.modal-search-input:focus { outline: none; border-color: var(--brand); }
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
  display: flex; align-items: center; gap: 10px;
  padding: 9px 10px; border-radius: var(--radius-sm);
  cursor: pointer; border: 1px solid transparent;
  user-select: none;
}
.modal-layer-item:hover { background: var(--bg-panel-raised); }
.modal-layer-item--checked {
  background: var(--brand-soft);
  border-color: var(--brand);
}
.modal-checkbox {
  width: 16px; height: 16px;
  border: 1.5px solid var(--border-strong);
  border-radius: 3px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0; background: var(--bg-panel);
}
.modal-layer-item--checked .modal-checkbox { background: var(--brand); border-color: var(--brand); }
.checkbox-check { color: #fff; font-size: 11px; font-weight: 700; line-height: 1; }
.modal-layer-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.modal-layer-name { font-size: 13px; color: var(--text-primary); font-weight: 500; }
.modal-layer-meta { font-size: 11px; color: var(--text-muted); font-family: var(--font-mono); }
.modal-empty { padding: 24px; text-align: center; color: var(--text-muted); font-size: 13px; }
.modal-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle); flex-shrink: 0;
  background: var(--bg-panel-raised);
}
.modal-selected-count { font-size: 12px; color: var(--text-secondary); font-family: var(--font-mono); }
.modal-actions { display: flex; gap: 8px; }
.btn-cancel {
  padding: 7px 16px; border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--bg-panel); color: var(--text-primary);
  font-size: 12.5px; font-family: inherit; cursor: pointer;
}
.btn-cancel:hover { background: var(--bg-hover); }
.btn-apply {
  padding: 7px 20px; border-radius: var(--radius-sm);
  border: 1px solid var(--brand-strong); background: var(--brand); color: #fff;
  font-size: 12.5px; font-family: inherit; font-weight: 700;
  cursor: pointer;
}
.btn-apply:hover { background: var(--brand-strong); }

/* ---------- انیمیشن مودال ---------- */
.modal-enter-active, .modal-leave-active { transition: opacity var(--dur-base) var(--ease-out); }
.modal-enter-active .layer-modal { transition: transform var(--dur-base) var(--ease-out); }
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .layer-modal { transform: translateY(8px); }
.modal-leave-to .layer-modal { transform: translateY(4px); }

@media (max-width: 760px) {
  .modal-footer { flex-wrap: wrap; gap: 8px; }
}
</style>

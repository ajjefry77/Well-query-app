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
  background: color-mix(in srgb, var(--bg-deep) 55%, rgba(0,0,0,0.55));
  display: flex; align-items: center; justify-content: center;
  z-index: 1000;
  backdrop-filter: blur(6px);
}
.layer-modal {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-lg);
  width: 460px; max-width: calc(100vw - 32px);
  max-height: 78vh;
  display: flex; flex-direction: column;
  box-shadow: var(--shadow-lg);
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
  width: 30px; height: 30px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-full);
  transition: background 0.15s, color 0.15s, transform 0.1s;
}
.modal-close:hover { background: var(--bg-input); color: var(--text-primary); }
.modal-close:active { transform: scale(0.9); }
.modal-search { padding: 12px 20px; flex-shrink: 0; border-bottom: 1px solid var(--border-subtle); }
.modal-search-input {
  width: 100%; background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-primary); font-size: 13px;
  padding: 9px 12px; border-radius: var(--radius-md);
  font-family: inherit; box-sizing: border-box;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.modal-search-input:focus { outline: none; border-color: var(--accent-depth); box-shadow: 0 0 0 3px var(--ring-color); }
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
  padding: 11px 12px; border-radius: var(--radius-md);
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
  padding: 8px 18px; border-radius: var(--radius-full);
  border: 1px solid var(--border-strong);
  background: var(--bg-input); color: var(--text-primary);
  font-size: 13px; font-family: inherit; cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.btn-cancel:hover { background: var(--bg-hover); border-color: var(--border-strong); }
.btn-apply {
  padding: 8px 22px; border-radius: var(--radius-full);
  border: none; background: var(--accent-depth); color: #fff;
  font-size: 13px; font-family: inherit; font-weight: 700;
  cursor: pointer; transition: opacity 0.15s, transform 0.1s, box-shadow 0.15s;
  box-shadow: var(--shadow-xs);
}
.btn-apply:hover { opacity: 0.9; box-shadow: var(--shadow-sm); }
.btn-apply:active { transform: scale(0.97); }

/* ---------- انیمیشن مودال ---------- */
.modal-enter-active { transition: opacity 0.28s var(--ease-out); }
.modal-leave-active { transition: opacity 0.2s var(--ease-out); }
.modal-enter-active .layer-modal {
  transition: transform 0.28s var(--ease-out);
}
.modal-enter-from,
.modal-leave-to { opacity: 0; }
.modal-enter-from .layer-modal {
  transform: translateY(16px) scale(0.97);
}
.modal-leave-to .layer-modal {
  transform: translateY(8px) scale(0.99);
}

@media (max-width: 760px) {
  .modal-footer { flex-wrap: wrap; gap: 8px; }
}
</style>

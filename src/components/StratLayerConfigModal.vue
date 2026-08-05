<template>
  <div class="modal-backdrop strat-cfg-backdrop">
    <div class="strat-cfg-modal" dir="rtl">

      <div class="modal-header">
        <h3>تنظیم لایه نمودار چینه‌شناسی</h3>
        <button v-if="allowClose" class="modal-close" @click="$emit('cancel')">×</button>
      </div>

      <p class="strat-cfg-desc">
        ابتدا لایه‌ی مربوط به چینه‌شناسی چاه را انتخاب کنید. انتخاب فیلدها فقط برای اطمینان شماست که لایه‌ی درستی انتخاب شده؛ کل داده‌های لایه (همه‌ی چاه‌ها و سازندها) در نمودار نمایش داده می‌شود.
      </p>

      <div v-if="loadingLayers" class="strat-cfg-state">
        <div class="strat-spinner"></div>
        <p>در حال دریافت لایه‌ها…</p>
      </div>

      <div v-else-if="layersError" class="strat-cfg-state strat-cfg-state--error">
        <span>⚠️</span>
        <p>{{ layersError }}</p>
        <button class="picker-btn" @click="loadLayers">تلاش مجدد</button>
      </div>

      <template v-else>
        <div class="strat-cfg-field">
          <label>لایه چینه‌شناسی</label>
          <select v-model="form.layerUuid" class="qb-select" @change="onLayerChange">
            <option value="" disabled>— انتخاب لایه —</option>
            <option v-for="l in layers" :key="l.uuid" :value="l.uuid">
              {{ l.display_name || l.name }}
            </option>
          </select>
        </div>

        <div v-if="loadingFields" class="strat-cfg-state">
          <div class="strat-spinner"></div>
          <p>در حال دریافت فیلدهای لایه…</p>
        </div>

        <div v-else-if="fieldsError" class="strat-cfg-state strat-cfg-state--error">
          <span>⚠️</span>
          <p>{{ fieldsError }}</p>
        </div>

        <template v-else-if="form.layerUuid">
          <div class="strat-cfg-field">
            <label>ارتفاع سقف</label>
            <select v-model="form.topField" class="qb-select">
              <option value="" disabled>— انتخاب فیلد —</option>
              <option v-for="f in fields" :key="'t'+f.key" :value="f.key">{{ f.label }}</option>
            </select>
          </div>

          <div class="strat-cfg-field">
            <label>ارتفاع کف</label>
            <select v-model="form.downField" class="qb-select">
              <option value="" disabled>— انتخاب فیلد —</option>
              <option v-for="f in fields" :key="'d'+f.key" :value="f.key">{{ f.label }}</option>
            </select>
          </div>

          <div class="strat-cfg-field">
            <label>اسم سازند</label>
            <select v-model="form.nameField" class="qb-select">
              <option value="" disabled>— انتخاب فیلد —</option>
              <option v-for="f in fields" :key="'n'+f.key" :value="f.key">{{ f.label }}</option>
            </select>
          </div>
        </template>
      </template>

      <div class="modal-footer strat-cfg-footer">
        <button class="btn-back" @click="$emit('back')">صفحه اصلی</button>
        <span class="strat-cfg-spacer"></span>
        <button v-if="allowClose" class="btn-cancel" @click="$emit('cancel')">انصراف</button>
        <button
          class="btn-confirm"
          :disabled="!canConfirm"
          @click="confirm"
        >
          نمایش نمودار
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { reactive, ref, computed, onMounted } from 'vue'
import { fetchVectorLayers, fetchLayerFields, buildQueryableFields } from '../composables/useGeoboxApi.js'

const props = defineProps({
  allowClose: { type: Boolean, default: false },
  initial: { type: Object, default: null }, // برای باز کردن دوباره با مقادیر قبلی
})
const emit = defineEmits(['confirm', 'cancel', 'back'])

const layers = ref([])
const loadingLayers = ref(false)
const layersError = ref(null)

const fields = ref([])
const loadingFields = ref(false)
const fieldsError = ref(null)

const form = reactive({
  layerUuid: props.initial?.layerUuid || '',
  topField:  props.initial?.topField  || '',
  downField: props.initial?.downField || '',
  nameField: props.initial?.nameField || '',
})

async function loadLayers() {
  loadingLayers.value = true
  layersError.value = null
  try {
    const res = await fetchVectorLayers()
    layers.value = Array.isArray(res) ? res : (res.results ?? res.data ?? [])
  } catch (e) {
    layersError.value = e.message
  } finally {
    loadingLayers.value = false
  }
}

async function loadFields(layerUuid) {
  loadingFields.value = true
  fieldsError.value = null
  fields.value = []
  try {
    const res = await fetchLayerFields(layerUuid)
    const apiFields = Array.isArray(res) ? res : (res.results ?? res.data ?? [])
    fields.value = buildQueryableFields(apiFields)
  } catch (e) {
    fieldsError.value = e.message
  } finally {
    loadingFields.value = false
  }
}

function onLayerChange() {
  form.topField = ''
  form.downField = ''
  form.nameField = ''
  if (form.layerUuid) loadFields(form.layerUuid)
}

onMounted(async () => {
  await loadLayers()
  if (form.layerUuid) await loadFields(form.layerUuid)
})

const canConfirm = computed(() =>
  !!form.layerUuid && !!form.topField && !!form.downField && !!form.nameField
)

function confirm() {
  if (!canConfirm.value) return
  emit('confirm', { ...form })
}
</script>

<style scoped>
.strat-cfg-backdrop {
  position: fixed; inset: 0;
  background: color-mix(in srgb, var(--bg-deep) 55%, rgba(0,0,0,0.55));
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
  backdrop-filter: blur(6px);
}

.strat-cfg-modal {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--bg-panel);
  border-radius: var(--radius-lg);
  padding: 18px 20px 16px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-strong);
}

.strat-cfg-modal .modal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.strat-cfg-modal .modal-header h3 {
  font-size: 15px; font-weight: 800; color: var(--text-primary); margin: 0;
}

.strat-cfg-desc {
  font-size: 12px; color: var(--text-muted); margin: 0 0 14px; line-height: 1.7;
}

.strat-cfg-field { margin-bottom: 12px; display: flex; flex-direction: column; gap: 5px; }
.strat-cfg-field label { font-size: 12px; font-weight: 700; color: var(--text-secondary); }

.strat-cfg-state {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 18px 0; color: var(--text-muted); font-size: 12.5px;
}
.strat-cfg-state--error { color: var(--accent-danger); }

.strat-cfg-footer {
  margin-top: 8px;
  display: flex; justify-content: flex-end; align-items: center; gap: 10px;
}

.strat-cfg-spacer { flex: 1; }

@media (max-width: 760px) {
  .strat-cfg-backdrop { align-items: flex-end; }
  .strat-cfg-modal {
    width: 100%;
    max-width: 100%;
    max-height: 88vh;
    overflow-y: auto;
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }
  .strat-cfg-footer { flex-wrap: wrap; gap: 8px; }
}

.qb-select {
  width: 100%;
  padding: 9px 10px;
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-sm);
  font-size: 12.5px;
  font-family: inherit;
  color: var(--text-primary);
  background: var(--bg-input);
  cursor: pointer;
  outline: none;
  transition: border-color .15s, box-shadow .15s;
}
.qb-select:focus { border-color: var(--accent-depth); box-shadow: 0 0 0 3px var(--ring-color); }

.picker-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 7px 16px;
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all .15s var(--ease-out);
}
.picker-btn:hover { background: var(--bg-hover); border-color: var(--accent-depth); color: var(--accent-depth); }

.strat-spinner {
  width: 22px; height: 22px;
  border: 3px solid var(--border-strong);
  border-top-color: var(--accent-depth);
  border-radius: 50%;
  animation: strat-spin .8s linear infinite;
}
@keyframes strat-spin { to { transform: rotate(360deg); } }

.modal-close {
  background: none; border: none; cursor: pointer;
  font-size: 20px; line-height: 1; color: var(--text-muted);
  padding: 2px 6px; border-radius: 6px;
}
.modal-close:hover { background: var(--bg-hover); color: var(--text-primary); }

.btn-cancel {
  background: var(--bg-input);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-full);
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s var(--ease-out);
}
.btn-cancel:hover { background: var(--bg-hover); }

.btn-back {
  background: transparent;
  color: var(--text-secondary);
  border: 1.5px solid var(--border-strong);
  border-radius: var(--radius-full);
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s var(--ease-out);
}
.btn-back:hover { background: var(--bg-hover); border-color: var(--accent-depth); color: var(--accent-depth); }

.btn-confirm {
  background: var(--accent-depth);
  color: #fff;
  border: none;
  border-radius: var(--radius-full);
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: all .15s var(--ease-out);
  box-shadow: var(--shadow-xs);
}
.btn-confirm:hover:not(:disabled) { background: var(--accent-depth-bright); box-shadow: var(--shadow-sm); }
.btn-confirm:disabled { background: var(--border-strong); cursor: not-allowed; opacity: 0.6; }
</style>

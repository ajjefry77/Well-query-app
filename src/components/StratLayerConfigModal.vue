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
  background: rgba(20, 24, 22, .55);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}

.strat-cfg-modal {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: #fff;
  border-radius: 14px;
  padding: 18px 20px 16px;
  box-shadow: 0 12px 48px rgba(0,0,0,.25);
}

.strat-cfg-modal .modal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 6px;
}
.strat-cfg-modal .modal-header h3 {
  font-size: 15px; font-weight: 800; color: #1e2a22; margin: 0;
}

.strat-cfg-desc {
  font-size: 12px; color: #6a8070; margin: 0 0 14px; line-height: 1.7;
}

.strat-cfg-field { margin-bottom: 12px; display: flex; flex-direction: column; gap: 5px; }
.strat-cfg-field label { font-size: 12px; font-weight: 700; color: #3a4a3e; }

.strat-cfg-state {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 18px 0; color: #6a8070; font-size: 12.5px;
}
.strat-cfg-state--error { color: #b33a3a; }

.strat-cfg-footer {
  margin-top: 8px;
  display: flex; justify-content: flex-end; align-items: center; gap: 10px;
}

.strat-cfg-spacer { flex: 1; }

.qb-select {
  width: 100%;
  padding: 8px 10px;
  border: 1.5px solid #d4cfc6;
  border-radius: 8px;
  font-size: 12.5px;
  font-family: inherit;
  color: #1e2a22;
  background: #fff;
  cursor: pointer;
  outline: none;
  transition: border-color .15s;
}
.qb-select:focus { border-color: #2e6a44; }

.picker-btn {
  background: #f0ece4;
  border: 1px solid #d4cfc6;
  border-radius: 7px;
  padding: 6px 14px;
  font-size: 12px;
  font-weight: 700;
  color: #3a4a3e;
  cursor: pointer;
}
.picker-btn:hover { background: #e2ded4; }

.strat-spinner {
  width: 22px; height: 22px;
  border: 3px solid #e2ded4;
  border-top-color: #2e6a44;
  border-radius: 50%;
  animation: strat-spin .8s linear infinite;
}
@keyframes strat-spin { to { transform: rotate(360deg); } }

.modal-close {
  background: none; border: none; cursor: pointer;
  font-size: 20px; line-height: 1; color: #7a8a80;
  padding: 2px 6px; border-radius: 6px;
}
.modal-close:hover { background: #f0ece4; color: #1e2a22; }

.btn-cancel {
  background: #f0ece4;
  color: #3a4a3e;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s;
}
.btn-cancel:hover { background: #e2ded4; }

.btn-back {
  background: #fff;
  color: #3a4a3e;
  border: 1.5px solid #d4cfc6;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s, border-color .15s;
}
.btn-back:hover { background: #f0ece4; border-color: #b9c4bc; }

.btn-confirm {
  background: #2e6a44;
  color: #fff;
  border: none;
  border-radius: 8px;
  padding: 8px 18px;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  transition: background .15s;
}
.btn-confirm:hover:not(:disabled) { background: #245636; }
.btn-confirm:disabled { background: #b9c4bc; cursor: not-allowed; }
</style>

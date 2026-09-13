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
        <p>{{ layersError }}</p>
        <button class="picker-btn" @click="loadLayers">تلاش مجدد</button>
      </div>

      <template v-else>
        <div class="strat-cfg-field">
          <label>لایه چینه‌شناسی</label>
          <AppSelect
            class="qb-select"
            :model-value="form.layerUuid"
            :options="layerOptions"
            placeholder="— انتخاب لایه —"
            @update:model-value="onLayerChange"
          />
        </div>

        <div v-if="loadingFields" class="strat-cfg-state">
          <div class="strat-spinner"></div>
          <p>در حال دریافت فیلدهای لایه…</p>
        </div>

        <div v-else-if="fieldsError" class="strat-cfg-state strat-cfg-state--error">
          <p>{{ fieldsError }}</p>
        </div>

        <template v-else-if="form.layerUuid">
          <div class="strat-cfg-field">
            <label>ارتفاع سقف</label>
            <AppSelect
              class="qb-select"
              :model-value="form.topField"
              :options="fieldOptions"
              placeholder="— انتخاب فیلد —"
              @update:model-value="form.topField = $event"
            />
          </div>

          <div class="strat-cfg-field">
            <label>ارتفاع کف</label>
            <AppSelect
              class="qb-select"
              :model-value="form.downField"
              :options="fieldOptions"
              placeholder="— انتخاب فیلد —"
              @update:model-value="form.downField = $event"
            />
          </div>

          <div class="strat-cfg-field">
            <label>اسم سازند</label>
            <AppSelect
              class="qb-select"
              :model-value="form.nameField"
              :options="fieldOptions"
              placeholder="— انتخاب فیلد —"
              @update:model-value="form.nameField = $event"
            />
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
import AppSelect from './AppSelect.vue'

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

const layerOptions = computed(() =>
  layers.value.map((l) => ({ value: l.uuid, label: l.display_name || l.name }))
)

const fieldOptions = computed(() =>
  fields.value.map((f) => ({ value: f.key, label: f.label }))
)

function onLayerChange(value) {
  form.layerUuid = value
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
  background: rgba(15, 25, 33, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 10000;
}

.strat-cfg-modal {
  width: 420px;
  max-width: calc(100vw - 32px);
  background: var(--bg-panel);
  border-radius: var(--radius-md);
  padding: 16px 20px;
  box-shadow: var(--shadow-lg);
  border: 1px solid var(--border-subtle);
}

.strat-cfg-modal .modal-header {
  display: flex; align-items: center; justify-content: space-between;
  margin-bottom: 4px;
  padding-bottom: 10px;
  border-bottom: 1px solid var(--border-subtle);
}
.strat-cfg-modal .modal-header h3 {
  font-size: 13.5px; font-weight: 700; color: var(--text-primary); margin: 0;
}

.strat-cfg-desc {
  font-size: 12px; color: var(--text-secondary); margin: 10px 0 14px; line-height: 1.7;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
}

.strat-cfg-field { margin-bottom: 10px; display: flex; flex-direction: column; gap: 5px; }
.strat-cfg-field label { font-size: 11.5px; font-weight: 600; color: var(--text-secondary); }

.strat-cfg-state {
  display: flex; flex-direction: column; align-items: center; gap: 8px;
  padding: 18px 0; color: var(--text-muted); font-size: 12.5px;
}
.strat-cfg-state--error { color: var(--accent-danger); }

.strat-cfg-footer {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
  display: flex; justify-content: flex-end; align-items: center; gap: 8px;
}

.strat-cfg-spacer { flex: 1; }

@media (max-width: 760px) {
  .strat-cfg-backdrop { align-items: flex-end; }
  .strat-cfg-modal {
    width: 100%;
    max-width: 100%;
    max-height: 88vh;
    overflow-y: auto;
    border-radius: var(--radius-md) var(--radius-md) 0 0;
    padding-bottom: calc(16px + env(safe-area-inset-bottom));
  }
  .strat-cfg-footer { flex-wrap: wrap; gap: 8px; }
}

.qb-select {
  width: 100%;
}

.picker-btn {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 7px 14px;
  font-size: 12px;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}
.picker-btn:hover { border-color: var(--brand); color: var(--brand); }

.strat-spinner {
  width: 22px; height: 22px;
  border: 2px solid var(--border-strong);
  border-top-color: var(--brand);
  border-radius: 50%;
  animation: strat-spin .8s linear infinite;
}
@keyframes strat-spin { to { transform: rotate(360deg); } }

.modal-close {
  background: transparent; border: 1px solid transparent; cursor: pointer;
  font-size: 18px; line-height: 1; color: var(--text-muted);
  width: 28px; height: 28px;
  display: flex; align-items: center; justify-content: center;
  border-radius: var(--radius-xs);
}
.modal-close:hover { background: var(--bg-panel-raised); color: var(--text-primary); border-color: var(--border-subtle); }

.btn-cancel {
  background: var(--bg-panel);
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 7px 16px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.btn-cancel:hover { background: var(--bg-panel-raised); border-color: var(--border-strong); color: var(--text-primary); }

.btn-back {
  background: transparent;
  color: var(--text-secondary);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 7px 16px;
  font-size: 12.5px;
  font-weight: 600;
  cursor: pointer;
}
.btn-back:hover { border-color: var(--text-muted); color: var(--text-primary); }

.btn-confirm {
  background: var(--brand);
  color: #fff;
  border: 1px solid var(--brand-strong);
  border-radius: var(--radius-sm);
  padding: 7px 16px;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;
}
.btn-confirm:hover:not(:disabled) { background: var(--brand-strong); }
.btn-confirm:disabled { background: var(--border-strong); border-color: var(--border-strong); cursor: not-allowed; opacity: 0.6; }
</style>

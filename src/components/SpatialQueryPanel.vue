<template>
  <div class="sq">
    <!-- دراپ‌داون انتخاب لایه (مثل کوئری توصیفی) -->
    <div class="layer-dropdown-wrap">
      <label class="layer-dropdown-label">لایه انتخابی</label>
      <div class="layer-dropdown-select-wrap">
        <span class="layer-dropdown-dot" :style="{ background: activeLayerColor }"></span>
        <AppSelect
          class="layer-dropdown-select"
          :model-value="activeLayer"
          :options="layerOptions"
          placeholder="انتخاب لایه…"
          @update:model-value="$emit('update:active-layer', $event)"
        />
      </div>
    </div>

    <!-- حالت انتخاب مرکز: از روی نقشه یا از لیست عارضه‌ها -->
    <div class="sq__tabs">
      <button
        class="sq__tab"
        :class="{ 'sq__tab--active': mode === 'map' }"
        @click="$emit('update:mode', 'map')"
      >
        انتخاب از روی نقشه
      </button>
      <button
        class="sq__tab"
        :class="{ 'sq__tab--active': mode === 'list' }"
        @click="$emit('update:mode', 'list')"
      >
        انتخاب از لیست عارضه‌ها
      </button>
    </div>

    <Transition name="sq-slide" mode="out-in">
      <!-- حالت: انتخاب از لیست -->
      <div v-if="mode === 'list'" key="list" class="sq__panel">
        <p class="sq__hint">
          یک عارضه از لایه انتخابی را به‌عنوان مرکز انتخاب کنید و شعاع جستجو را تنظیم نمایید
        </p>

        <div class="field-group">
          <label>عارضه مرجع</label>
          <AppSelect
            class="qb-select qb-select--full"
            :model-value="radiusCenter?.id != null && !isCustomPoint ? String(radiusCenter.id) : ''"
            :options="centerOptions"
            placeholder="یک عارضه انتخاب کنید…"
            @update:model-value="onCenterChange"
          />
        </div>

        <div class="sq__info mono" v-if="radiusCenter && !isCustomPoint && radiusCenter.id != null">
          <span class="sq__center-id">#{{ radiusCenter.id }}</span><template v-if="centerLabel"> — {{ centerLabel }}</template><br />
          مرکز: {{ centerLatLng?.lat?.toFixed(5) }},
          {{ centerLatLng?.lng?.toFixed(5) }}
        </div>
      </div>
      <!-- حالت: انتخاب از روی نقشه -->
      <div v-else key="map" class="sq__panel">
        <p class="sq__hint">
          روی نقشه کلیک کنید؛ اگر روی فضای خالی بزنید نقطه دلخواه و اگر روی یک عارضه بزنید همان عارضه به‌عنوان مرکز انتخاب می‌شود
        </p>

        <div class="field-group">
          <label>نقطه مرکزی</label>
          <button
            class="btn-pick"
            :class="{ 'btn-pick--active': isPicking }"
            @click="$emit('pick-point')"
          >
            {{
              isPicking
                ? "در انتظار کلیک روی نقشه…"
                : hasCenter
                  ? "تغییر نقطه مرکزی"
                  : "انتخاب نقطه از نقشه"
            }}
          </button>
        </div>
      </div>
    </Transition>

    <!-- شعاع جستجو (مشترک) -->
    <div class="field-group">
      <label>شعاع جستجو: <span class="mono accent">{{ displayRadius }} کیلومتر</span></label>
      <div class="radius-control">
        <input
          type="range"
          :min="sliderCfg.min"
          :max="sliderCfg.max"
          :step="sliderCfg.step"
          :value="Math.min(displayRadius, sliderCfg.max)"
          @input="onSliderRadius($event)"
          class="slider"
        />
        <input
          type="number"
          :min="numberCfg.min"
          :step="numberCfg.step"
          :value="displayRadius"
          @input="onManualRadius($event)"
          class="radius-input"
          aria-label="شعاع جستجو (کیلومتر)"
        />
        <span class="radius-unit">کیلومتر</span>
      </div>
      <p class="sq__hint sq__hint--tiny">اسلایدر تا {{ sliderCfg.max }} کیلومتر است؛ برای مقادیر بزرگ‌تر عدد را دستی وارد کنید (بدون سقف).</p>
    </div>

    <button
      v-if="radiusCenter || customPoint"
      class="btn-clear-spatial"
      @click="$emit('clear-spatial')"
    >
      پاک کردن کوئری مکانی
    </button>

    <button
      v-if="(radiusCenter || customPoint)"
      class="btn-apply-spatial"
      :disabled="spatialLoading"
      @click="$emit('apply-spatial')"
    >
      {{ spatialLoading ? 'در حال اعمال…' : 'اعمال تغییرات' }}
    </button>

    <!-- مودال انتخاب فیلد نام -->
    <Transition name="modal">
      <div v-if="showNameFieldModal" class="modal-backdrop" @click.self="dismissNameFieldModal">
        <div class="modal-content">
          <div class="modal-header">
            <h3>انتخاب فیلد نام عارضه</h3>
            <button class="modal-close" @click="dismissNameFieldModal">×</button>
          </div>
          <p class="modal-hint">هیچ فیلی با واژه "name" در ویژگی‌های لایه یافت نشد. لطفاً فیلد نام را از لیست زیر انتخاب کنید:</p>
          <div class="modal-body">
            <AppSelect
              :model-value="selectedNameField"
              :options="nameFieldOptions"
              placeholder="فیلد نام را انتخاب کنید…"
              @update:model-value="selectedNameField = $event"
            />
          </div>
          <div class="modal-footer">
            <button class="btn-cancel" @click="dismissNameFieldModal">انصراف</button>
            <button class="btn-apply" :disabled="!selectedNameField" @click="confirmNameField">تأیید</button>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { computed, ref, watch, nextTick } from "vue";
import AppSelect from "./AppSelect.vue";

const props = defineProps({
  mode: { type: String, required: true },
  wells: { type: Array, required: true },
  layers: { type: Array, default: () => [] },
  activeLayer: { type: String, default: null },
  activeLayerColor: { type: String, default: "#2a9d8f" },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, required: true },
  // نگهداشته‌شده برای سازگاری با نسخه‌های قدیمی؛ دیگر استفاده نمی‌شود (فقط کیلومتر)
  radiusUnit: { type: String, default: "km" },
  fields: { type: Array, default: () => [] },
  // فیلدهای لایه فعال (برای جستجوی فیلد name)
  layerFields: { type: Array, default: () => [] },
  customPoint: { type: Object, default: null },
  isPicking: { type: Boolean, default: false },
  spatialLoading: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:mode",
  "update:active-layer",
  "update:radius-center",
  "update:radius-km",
  "update:radius-unit",
  "pick-point",
  "clear-point",
  "clear-spatial",
  "apply-spatial",
]);

// مودال انتخاب دستی فیلد نام
const showNameFieldModal = ref(false)
const selectedNameField = ref('')

// جستجوی فیلدی که key-ش شامل "name" باشد (بدون حساسیت به حروف بزرگ/کوچک)
function findNameField() {
  for (const f of props.layerFields) {
    if (f.key && f.key.toLowerCase().includes('name')) {
      return f.key
    }
  }
  for (const key of props.fields) {
    if (key && key.toLowerCase().includes('name')) {
      return key
    }
  }
  return null
}

const labelField = computed(() => {
  return findNameField() || (selectedNameField.value || null)
})

// نمایش گزینه‌های فیلد برای مودال
const nameFieldOptions = computed(() =>
  props.layerFields.map((f) => ({
    value: f.key,
    label: `${f.label || f.key} (${f.key})`,
  })),
)

// وقتی لایه فعال یا فیلدهایش تغییر کرد، بررسی کن آیا مودال نیاز دارد
watch([() => props.activeLayer, () => props.layerFields], () => {
  selectedNameField.value = ''
  showNameFieldModal.value = false
  nextTick(() => {
    if (!findNameField() && props.layerFields.length > 0) {
      showNameFieldModal.value = true
    }
  })
})

function confirmNameField() {
  if (selectedNameField.value) {
    showNameFieldModal.value = false
  }
}

function dismissNameFieldModal() {
  showNameFieldModal.value = false
  selectedNameField.value = ''
}

const layerOptions = computed(() =>
  props.layers.map((layer) => ({
    value: layer.uuid,
    label: layer.display_name || layer.name,
  })),
);

// عارضه‌های لایه فعال (فیلتر برای لیست) — اگر لایه‌ای انتخاب نشده همه
const scopedWells = computed(() => {
  if (!props.activeLayer) return props.wells;
  return props.wells.filter((w) => String(w._layerUuid) === String(props.activeLayer));
});

const wellsWithCoords = computed(() =>
  scopedWells.value.filter((w) => Number.isFinite(+w.lat) && Number.isFinite(+w.lng)),
);

// نقطه دلخواه = مرکزی که شناسه عارضه ندارد ولی مختصات دارد
const isCustomPoint = computed(() => {
  const c = props.radiusCenter;
  if (!c) return false;
  if (c.id != null) return false;
  return Number.isFinite(+c.lat) && Number.isFinite(+c.lng);
});

const hasCenter = computed(() => !!(props.radiusCenter || props.customPoint));

const centerLatLng = computed(() => {
  const c = props.radiusCenter;
  if (!c) return null;
  if (Number.isFinite(+c.lat) && Number.isFinite(+c.lng))
    return { lat: +c.lat, lng: +c.lng };
  return null;
});

const centerLabel = computed(() => {
  const c = props.radiusCenter;
  if (!c || !labelField.value) return '';
  return c[labelField.value] ?? '';
});

const centerOptions = computed(() =>
  wellsWithCoords.value.map((w) => ({
    value: String(w.id),
    label: labelField.value
      ? `#${w.id} — ${w[labelField.value]}`
      : `#${w.id}`,
  })),
);

function onCenterChange(id) {
  const well = scopedWells.value.find((w) => String(w.id) === String(id));
  emit("update:radius-center", well || null);
}

function onManualRadius(e) {
  let val = parseFloat(e.target.value);
  if (Number.isNaN(val)) return;
  // فقط کیلومتر، بدون سقف؛ فقط کف ۰٫۱ کیلومتر
  if (val < 0.1) val = 0.1;
  emit("update:radius-km", val);
}

function onSliderRadius(e) {
  const val = parseFloat(e.target.value);
  if (Number.isNaN(val)) return;
  emit("update:radius-km", val);
}

// فقط کیلومتر — اسلایدر صرفاً برای راحتی است، ورودی دستی سقفی ندارد
const displayRadius = computed(() => {
  if (!Number.isFinite(props.radiusKm)) return 0;
  return Math.round(props.radiusKm * 10) / 10;
});

const sliderCfg = { min: 0.5, max: 500, step: 0.5 };

const numberCfg = { min: 0.1, step: 0.1 };
</script>

<style scoped>
.sq {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
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
.sq__tabs {
  display: flex;
  gap: 2px;
  background: var(--bg-panel-raised);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}
.sq__tab {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12px;
  padding: 7px 6px;
  border-radius: 5px;
  font-weight: 600;
  cursor: pointer;
  transition:
    background-color 0.28s var(--ease-smooth),
    color 0.28s var(--ease-smooth),
    box-shadow 0.28s var(--ease-smooth);
}
.sq__tab:hover:not(.sq__tab--active) {
  color: var(--text-primary);
}
.sq__tab--active {
  background: var(--bg-panel);
  color: var(--brand);
  font-weight: 700;
  box-shadow: var(--shadow-xs), inset 0 0 0 1px var(--border-subtle);
}
.sq__panel {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.sq__hint {
  margin: 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.7;
}
.sq__hint--tiny {
  font-size: 11px;
  opacity: 0.85;
}
.sq__info {
  font-size: 11px;
  color: var(--text-secondary);
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  direction: ltr;
}
.sq__center-id {
  color: var(--text-primary);
  font-weight: 700;
}
.field-group {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.field-group label {
  font-size: 12px;
  color: var(--text-secondary);
}
.accent {
  color: var(--brand);
  font-weight: 700;
}
.qb-select {
  display: block;
}
.qb-select--full {
  width: 100%;
}
.slider {
  width: 100%;
  accent-color: var(--accent-depth);
  height: 5px;
  cursor: pointer;
}
.radius-control {
  display: flex;
  align-items: center;
  gap: 8px;
}
.radius-control .slider {
  flex: 1;
}
.radius-input {
  width: 84px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 12.5px;
  padding: 6px 10px;
  border-radius: var(--radius-xs);
  font-family: var(--font-mono);
  text-align: center;
  -moz-appearance: textfield;
  appearance: textfield;
}
.radius-input::-webkit-outer-spin-button,
.radius-input::-webkit-inner-spin-button {
  -webkit-appearance: none;
  margin: 0;
}
.radius-input:focus {
  outline: none;
  border-color: var(--brand);
}
.radius-unit {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.btn-pick {
  width: 100%;
  padding: 9px 14px;
  background: var(--bg-panel);
  border: 1px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 12.5px;
  font-weight: 600;
  text-align: center;
  cursor: pointer;
}
.btn-pick:hover:not(.btn-pick--active) {
  border-color: var(--brand);
  color: var(--brand);
}
.btn-pick--active {
  border-color: var(--brand);
  border-style: solid;
  color: var(--brand);
  background: var(--brand-soft);
}

.point-info {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 10px;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  font-size: 11px;
  color: var(--text-muted);
  direction: ltr;
}
.btn-clear-point {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  font-size: 12px;
  padding: 0 4px;
}
.btn-clear-point:hover {
  color: var(--accent-danger);
}
.btn-clear-spatial {
  width: 100%;
  padding: 8px 14px;
  background: transparent;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  font-size: 12px;
  font-family: inherit;
  cursor: pointer;
}
.btn-clear-spatial:hover {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}

.btn-apply-spatial {
  width: 100%;
  padding: 9px 14px;
  background: var(--brand);
  border: none;
  border-radius: var(--radius-sm);
  color: #fff;
  font-size: 12.5px;
  font-weight: 700;
  font-family: inherit;
  cursor: pointer;
  margin-top: 8px;
}
.btn-apply-spatial:hover:not(:disabled) {
  opacity: 0.9;
}
.btn-apply-spatial:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* ─── انیمیشن سوییچ تب‌ها ─── */
.sq-slide-enter-active {
  transition: opacity 0.22s var(--ease-out), transform 0.28s var(--ease-smooth);
}
.sq-slide-leave-active {
  transition: opacity 0.14s var(--ease-out), transform 0.14s var(--ease-out);
}
.sq-slide-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
.sq-slide-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

/* ─── مودال ─── */
.modal-backdrop {
  position: fixed; inset: 0;
  background: rgba(15, 25, 33, 0.5);
  display: flex; align-items: center; justify-content: center;
  z-index: 2000;
}
.modal-content {
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  width: 420px; max-width: calc(100vw - 32px);
  box-shadow: var(--shadow-lg);
  overflow: hidden;
}
.modal-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px 12px;
  border-bottom: 1px solid var(--border-subtle);
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
.modal-hint {
  margin: 12px 16px 0; font-size: 12px; color: var(--text-muted); line-height: 1.7;
}
.modal-body { padding: 12px 16px; }
.modal-footer {
  display: flex; align-items: center; justify-content: flex-end; gap: 8px;
  padding: 12px 16px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-panel-raised);
}
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
.btn-apply:hover:not(:disabled) { background: var(--brand-strong); }
.btn-apply:disabled { opacity: 0.5; cursor: not-allowed; }
.modal-enter-active, .modal-leave-active {
  transition: opacity 0.2s var(--ease-out);
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
}
.modal-content-enter-active, .modal-content-leave-active {
  transition: transform 0.25s var(--ease-out), opacity 0.2s var(--ease-out);
}
.modal-content-enter-from, .modal-content-leave-to {
  transform: translateY(-12px);
  opacity: 0;
}
</style>

<template>
  <div class="sq">
    <div class="sq__tabs">
      <button
        class="sq__tab"
        :class="{ 'sq__tab--active': mode === 'radius' }"
        @click="$emit('update:mode', 'radius')"
      >
        فاصله از عارضه
      </button>
      <button
        class="sq__tab"
        :class="{ 'sq__tab--active': mode === 'point' }"
        @click="$emit('update:mode', 'point')"
      >
        فاصله از نقطه دلخواه
      </button>
    </div>

    <!-- حالت: فاصله از عارضه -->
    <div v-if="mode === 'radius'" class="sq__panel">
      <p class="sq__hint">
        یک عارضه را به‌عنوان مرکز انتخاب کنید و شعاع جستجو را تنظیم نمایید
      </p>

      <div class="field-group">
        <label>عارضه مرجع</label>
        <AppSelect
          class="qb-select qb-select--full"
          :model-value="radiusCenter?.id || ''"
          :options="centerOptions"
          placeholder="یک عارضه انتخاب کنید…"
          @update:model-value="onCenterChange"
        />
      </div>

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

      <div class="sq__info mono" v-if="radiusCenter">
        <span class="sq__center-id">#{{ radiusCenter.id }}</span><template v-if="centerLabel"> — {{ centerLabel }}</template><br />
        مرکز: {{ centerLatLng?.lat?.toFixed(5) }},
        {{ centerLatLng?.lng?.toFixed(5) }}
      </div>
    </div>

    <!-- حالت: فاصله از نقطه دلخواه -->
    <div v-if="mode === 'point'" class="sq__panel">
      <p class="sq__hint">
        روی نقشه کلیک کنید تا نقطه مرکزی مشخص شود، سپس شعاع جستجو را تنظیم
        نمایید
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
              ? "🎯 روی نقشه کلیک کنید..."
              : customPoint
                ? "📍 تغییر نقطه"
                : "📍 انتخاب نقطه از نقشه"
          }}
        </button>

        <div v-if="customPoint" class="point-info">
          <span class="mono">
            {{ customPoint.lat.toFixed(5) }},
            {{ customPoint.lng.toFixed(5) }}
          </span>
          <button class="btn-clear-point" @click="$emit('clear-point')">✕</button>
        </div>
      </div>

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
    </div>

    <button
      v-if="radiusCenter || customPoint"
      class="btn-clear-spatial"
      @click="$emit('clear-spatial')"
    >
      ✕ پاک کردن کوئری مکانی
    </button>
  </div>
</template>

<script setup>
import { computed } from "vue";
import AppSelect from "./AppSelect.vue";

const props = defineProps({
  mode: { type: String, required: true },
  wells: { type: Array, required: true },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, required: true },
  // نگهداشته‌شده برای سازگاری با نسخه‌های قدیمی؛ دیگر استفاده نمی‌شود (فقط کیلومتر)
  radiusUnit: { type: String, default: "km" },
  fields: { type: Array, default: () => [] },
  customPoint: { type: Object, default: null },
  isPicking: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:mode",
  "update:radius-center",
  "update:radius-km",
  "update:radius-unit",
  "pick-point",
  "clear-point",
  "clear-spatial",
]);

const wellsWithCoords = computed(() =>
  props.wells.filter((w) => Number.isFinite(+w.lat) && Number.isFinite(+w.lng)),
);

const firstLabelField = computed(() =>
  props.fields.length ? props.fields[0] : null,
);

const centerLatLng = computed(() => {
  const c = props.radiusCenter;
  if (!c) return null;
  if (Number.isFinite(+c.lat) && Number.isFinite(+c.lng))
    return { lat: +c.lat, lng: +c.lng };
  return null;
});

const centerLabel = computed(() => {
  const c = props.radiusCenter;
  if (!c || !firstLabelField.value) return '';
  return c[firstLabelField.value] ?? '';
});

const centerOptions = computed(() =>
  wellsWithCoords.value.map((w) => ({
    value: w.id,
    label: firstLabelField.value
      ? `#${w.id} — ${w[firstLabelField.value]}`
      : `#${w.id}`,
  })),
);

function onCenterChange(id) {
  const well = props.wells.find((w) => String(w.id) === String(id));
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
.sq__tabs {
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
}
.sq__tab {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12.5px;
  padding: 8px 6px;
  border-radius: var(--radius-full);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.2s var(--ease-out), color 0.15s, box-shadow 0.15s;
}
.sq__tab:hover:not(.sq__tab--active) {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}
.sq__tab--active {
  background: var(--bg-panel);
  color: var(--accent-depth);
  font-weight: 700;
  box-shadow: var(--shadow-xs), inset 0 0 0 1px color-mix(in srgb, var(--accent-depth) 25%, transparent);
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
  color: var(--text-muted);
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  direction: ltr;
}
.sq__center-id {
  color: #e74c3c;
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
  color: var(--accent-depth);
  font-weight: 600;
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
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-family: var(--font-mono);
  text-align: center;
  transition: border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out);
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
  border-color: var(--accent-depth);
  box-shadow: 0 0 0 3px var(--ring-color);
}
.radius-unit {
  font-size: 11px;
  color: var(--text-muted);
  font-family: var(--font-mono);
}

.btn-pick {
  width: 100%;
  padding: 10px 14px;
  background: var(--bg-input);
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s var(--ease-out);
}
.btn-pick:hover:not(.btn-pick--active) {
  border-color: var(--accent-depth);
  color: var(--accent-depth);
  background: color-mix(in srgb, var(--accent-depth) 5%, var(--bg-input));
}
.btn-pick--active {
  border-color: var(--accent-depth);
  color: var(--accent-depth);
  background: color-mix(in srgb, var(--accent-depth) 8%, transparent);
  animation: pulse 1.2s infinite;
}
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
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
  padding: 9px 14px;
  background: color-mix(in srgb, var(--accent-danger) 6%, transparent);
  border: 1px solid color-mix(in srgb, var(--accent-danger) 25%, transparent);
  border-radius: var(--radius-md);
  color: var(--text-muted);
  font-size: 12.5px;
  font-family: inherit;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.btn-clear-spatial:hover {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
  background: color-mix(in srgb, var(--accent-danger) 10%, transparent);
}
</style>

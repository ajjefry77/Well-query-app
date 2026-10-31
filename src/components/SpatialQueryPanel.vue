<template>
  <div class="sq">
    <!-- ─── گام ۱: عوارض مبدأ (انتخاب‌شده‌های روی نقشه) ─── -->
    <!-- نکته: ابزارهای انتخاب فقط در تولبار «ابزارها» روی نقشه‌اند؛ اینجا فقط وضعیت نمایش داده می‌شود -->
    <div class="sq__step">
      <div class="sq__step-title">
        <span class="sq__step-num">۱</span>
        <span>عوارض مبدأ</span>
      </div>

      <div class="sel-status">
        <span class="sel-count" :class="{ 'sel-count--empty': !selectionCount }">
          {{ selectionCount.toLocaleString('fa-IR') }} عارضه انتخاب شده
        </span>
        <div class="sel-actions">
          <button class="sel-clear" :disabled="!selectionCount" @click="$emit('zoom-selection')" title="زوم روی عوارض انتخاب‌شده">
            زوم
          </button>
          <button class="sel-clear sel-clear--danger" :disabled="!selectionCount" @click="$emit('clear-selection')">
            پاک کردن
          </button>
        </div>
      </div>
      <p class="sq__hint sq__hint--tiny">انتخاب عارضه با ابزارهای تولبار نقشه انجام می‌شود (مستطیل، دایره، دستی).</p>

      <!-- حالت مبدأ: تب‌ها با کوئری توصیفی هم‌نام‌اند (انتخاب‌شده‌ها / همه عوارض) -->
      <div class="src-mode">
        <button
          class="src-mode__btn"
          :class="{ 'src-mode__btn--active': sourceMode === 'selected' }"
          :disabled="!selectionCount"
          :title="selectionCount ? 'اجرای رابطه مکانی از روی عوارض انتخاب‌شده' : 'ابتدا از روی نقشه عارضه انتخاب کنید'"
          @click="$emit('update:source-mode', 'selected')"
        >
          انتخاب‌شده‌ها<template v-if="selectionCount"> ({{ selectionCount.toLocaleString('fa-IR') }})</template>
        </button>
        <button
          class="src-mode__btn"
          :class="{ 'src-mode__btn--active': sourceMode === 'layer' }"
          @click="$emit('update:source-mode', 'layer')"
        >
          همه عوارض
        </button>
      </div>

      <div class="layer-dropdown-wrap">
        <label class="layer-dropdown-label">
          {{ sourceMode === 'layer' ? 'لایه مبدأ (کل لایه)' : 'محدود به لایه (اختیاری)' }}
        </label>
        <AppSelect
          class="layer-dropdown-select"
          :model-value="sourceLayer"
          :options="layerOptions"
          :placeholder="sourceMode === 'layer' ? 'انتخاب لایه مبدأ…' : 'همه لایه‌ها…'"
          @update:model-value="$emit('update:source-layer', $event)"
        />
      </div>
      <p v-if="sourceMode === 'selected' && !selectionCount" class="sq__warn">
        هنوز عارضه‌ای انتخاب نشده — ابتدا از تولبار «ابزارها» روی نقشه انتخاب کنید.
      </p>
    </div>

    <!-- ─── گام ۲: لایه هدف ─── -->
    <div class="sq__step" :class="{ 'sq__step--disabled': !sourceReady }">
      <div class="sq__step-title">
        <span class="sq__step-num">۲</span>
        <span>لایه هدف</span>
      </div>
      <div class="layer-dropdown-wrap">
        <AppSelect
          class="layer-dropdown-select"
          :model-value="targetLayer"
          :options="layerOptions"
          placeholder="انتخاب لایه هدف…"
          :disabled="!sourceReady"
          @update:model-value="$emit('update:target-layer', $event)"
        />
      </div>
    </div>

    <!-- ─── گام ۳: نوع رابطه ─── -->
    <div class="sq__step" :class="{ 'sq__step--disabled': !sourceReady || !targetLayer }">
      <div class="sq__step-title">
        <span class="sq__step-num">۳</span>
        <span>نوع رابطه</span>
      </div>
      <div class="field-group">
        <div class="relation-dropdown" :class="{ 'relation-dropdown--open': relationDropdownOpen }">
          <button
            type="button"
            class="relation-dropdown__trigger"
            :disabled="!sourceReady || !targetLayer"
            @click="relationDropdownOpen = !relationDropdownOpen"
          >
            <span>{{ relationSummaryText }}</span>
            <span class="relation-dropdown__chevron">▾</span>
          </button>
          <div v-if="relationDropdownOpen" class="relation-dropdown__menu">
            <label v-for="option in operatorOptions" :key="option.value" class="relation-option">
              <input
                type="checkbox"
                :checked="selectedOperators.includes(option.value)"
                @change="toggleOperator(option.value, $event.target.checked)"
              />
              <span>{{ option.label }}</span>
            </label>
          </div>
        </div>
      </div>
      <p class="sq__hint">{{ operatorHint }}</p>

      <!-- شعاع (فقط برای عملگر فاصله) -->
      <div v-if="selectedOperators.includes('within-distance')" class="field-group">
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
      </div>
    </div>

    <!-- ─── اجرا (نام یکسان با کوئری توصیفی) ─── -->
    <button
      v-if="canApply"
      class="btn-apply-spatial"
      :disabled="relationLoading"
      @click="$emit('apply-relation')"
    >
      {{ relationLoading ? 'در حال اجرا…' : 'اجرای کوئری' }}
    </button>
    <p v-else class="sq__hint sq__hint--tiny">{{ applyHint }}</p>
    <p v-if="relationError" class="sq__error" role="alert">{{ relationError }}</p>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import AppSelect from "./AppSelect.vue";
import { RELATION_OPERATORS, normalizeRelationOperators } from "../composables/useSpatialRelations.js";

const props = defineProps({
  layers: { type: Array, default: () => [] },
  wells: { type: Array, default: () => [] },
  // ── وضعیت انتخاب عارضه (انتخاب فقط با تولبار نقشه انجام می‌شود) ──
  selectionCount: { type: Number, default: 0 },
  selectionLayers: { type: Array, default: () => [] },
  // ── مبدأ/هدف + عملگر ──
  sourceMode: { type: String, default: "layer" },
  sourceLayer: { type: String, default: null },
  targetLayer: { type: String, default: null },
  operator: { type: [String, Array], default: () => [] },
  radiusKm: { type: Number, default: 3 },
  relationLoading: { type: Boolean, default: false },
  relationError: { type: String, default: null },
});

const emit = defineEmits([
  "clear-selection",
  "zoom-selection",
  "update:source-mode",
  "update:source-layer",
  "update:target-layer",
  "update:operator",
  "update:radius-km",
  "apply-relation",
]);

const relationDropdownOpen = ref(false);
const layerOptions = computed(() =>
  props.layers.map((layer) => ({
    value: layer.uuid,
    label: layer.display_name || layer.name,
  })),
);

const selectedOperators = computed(() => normalizeRelationOperators(props.operator));
const operatorOptions = computed(() =>
  RELATION_OPERATORS.map((o) => ({ value: o.value, label: o.label })),
);
const relationSummaryText = computed(() => {
  if (!selectedOperators.value.length) return 'انتخاب نوع رابطه';
  if (selectedOperators.value.length === 1) return RELATION_OPERATORS.find(o => o.value === selectedOperators.value[0])?.label ?? 'نوع رابطه';
  return `${selectedOperators.value.length} نوع رابطه انتخاب شده`;
});
const operatorHint = computed(() => {
  const chosen = selectedOperators.value;
  if (!chosen.length) return 'حداقل یک نوع رابطه را انتخاب کنید.';
  if (chosen.length === 1) {
    return RELATION_OPERATORS.find((o) => o.value === chosen[0])?.hint ?? '';
  }
  return 'نتیجه با ترکیب OR بین نوع‌های انتخاب‌شده ساخته می‌شود.';
});

function toggleOperator(value, checked) {
  const current = new Set(selectedOperators.value);
  if (checked) current.add(value);
  else current.delete(value);
  const next = [...current];
  emit('update:operator', next);
}

// گام ۱ آماده است اگر: حالت انتخاب‌شده + حداقل یک انتخاب، یا حالت کل‌لایه + لایه مبدأ
const sourceReady = computed(() => {
  if (props.sourceMode === "layer") return !!props.sourceLayer;
  return props.selectionCount > 0;
});

// دکمه اجرا فقط وقتی که مبدأ و هدف مشخص باشند
// در حالت «از عوارض انتخاب‌شده» اگر لایه مبدأ هم مشخص شده، باید انتخابی در همان لایه باشد
// (وگرنه اجرا بی‌صدا هیچ کاری نمی‌کرد)
const selectionInSource = computed(() => {
  if (props.sourceMode !== "selected") return true;
  if (!props.sourceLayer) return props.selectionCount > 0;
  return props.selectionLayers.map(String).includes(String(props.sourceLayer));
});

const canApply = computed(() => {
  if (!sourceReady.value || !props.targetLayer) return false;
  if (!selectionInSource.value) return false;
  const operators = normalizeRelationOperators(props.operator);
  if (operators.includes('within-distance')) {
    const r = Number(props.radiusKm);
    if (!Number.isFinite(r) || r <= 0) return false;
  }
  return true;
});

const applyHint = computed(() => {
  if (!sourceReady.value) {
    return props.sourceMode === "layer"
      ? "ابتدا لایه مبدأ را انتخاب کنید."
      : "ابتدا با ابزارهای تب «انتخاب» تولبار نقشه، عارضه انتخاب کنید.";
  }
  if (!selectionInSource.value)
    return "عارضه‌های انتخاب‌شده در لایه مبدأ نیستند — لایه مبدأ را عوض کنید یا انتخاب جدید بکنید.";
  if (!props.targetLayer) return "حالا لایه هدف را انتخاب کنید.";
  if (!selectedOperators.value.length) return "حداقل یک نوع رابطه را انتخاب کنید.";
  return "";
});

function onManualRadius(e) {
  let val = parseFloat(e.target.value);
  if (Number.isNaN(val)) return;
  if (val < 0.1) val = 0.1;
  emit("update:radius-km", val);
}

function onSliderRadius(e) {
  const val = parseFloat(e.target.value);
  if (Number.isNaN(val)) return;
  emit("update:radius-km", val);
}

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
.sq__step {
  display: flex;
  flex-direction: column;
  gap: 10px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 12px;
}
.sq__step--disabled {
  opacity: 0.55;
}
.sq__step-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  font-weight: 700;
  color: var(--text-primary);
}
.sq__step-num {
  width: 22px;
  height: 22px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--brand);
  color: #fff;
  font-size: 11.5px;
  font-weight: 700;
  border-radius: 50%;
}
.sq__step--disabled .sq__step-num {
  background: var(--text-muted);
}
.layer-dropdown-wrap { display: flex; flex-direction: column; gap: 5px; }
.layer-dropdown-label {
  font-size: 11px; font-weight: 700;
  color: var(--text-muted);
  letter-spacing: 0.02em;
}
.layer-dropdown-select {
  width: 100%;
}
/* وضعیت انتخاب (ابزارها فقط در تولبار نقشه‌اند) */
.sel-status {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.sel-actions {
  display: flex;
  gap: 5px;
  flex-shrink: 0;
}
.sel-count {
  font-size: 12px;
  font-weight: 700;
  color: #0891b2;
}
.sel-count--empty {
  color: var(--text-muted);
  font-weight: 600;
}
.sel-clear {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  font-size: 11px;
  font-family: inherit;
  font-weight: 600;
  padding: 5px 12px;
  cursor: pointer;
  white-space: nowrap;
}
.sel-clear:hover:not(:disabled) {
  border-color: #06b6d4;
  color: #0891b2;
}
.sel-clear--danger:hover:not(:disabled) {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}
.sel-clear:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
/* حالت مبدأ */
.src-mode {
  display: flex;
  gap: 2px;
  background: var(--bg-panel);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
}
.src-mode__btn {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 11.5px;
  padding: 7px 6px;
  border-radius: 5px;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
}
.src-mode__btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.src-mode__btn--active {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 700;
  box-shadow: var(--shadow-xs), inset 0 0 0 1px var(--border-subtle);
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
.sq__warn {
  margin: 0;
  font-size: 11.5px;
  color: var(--accent-amber, #b45309);
  line-height: 1.7;
}
.sq__error {
  margin: 0;
  font-size: 11.5px;
  color: var(--accent-danger, #b91c1c);
  background: rgba(185, 28, 28, 0.07);
  border: 1px solid rgba(185, 28, 28, 0.3);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  line-height: 1.8;
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
.relation-dropdown {
  position: relative;
}
.relation-dropdown__trigger {
  width: 100%;
  appearance: none;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  font: inherit;
  font-size: 12px;
  font-weight: 600;
  padding: 9px 10px;
  cursor: pointer;
}
.relation-dropdown__trigger:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.relation-dropdown__chevron {
  color: var(--text-muted);
}
.relation-dropdown__menu {
  position: absolute;
  inset: calc(100% + 6px) auto auto 0;
  width: 100%;
  max-height: 280px;
  overflow: auto;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  box-shadow: var(--shadow-sm);
  padding: 8px;
  z-index: 30;
}
.relation-option {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 6px;
  border-radius: var(--radius-xs);
  color: var(--text-primary);
  font-size: 12px;
  line-height: 1.5;
}
.relation-option input {
  width: 15px;
  height: 15px;
  accent-color: var(--brand);
  margin: 0;
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
</style>

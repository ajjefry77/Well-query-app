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
        <label>شعاع جستجو: <span class="mono accent">{{ radiusKm }} km</span></label>
        <div class="radius-control">
          <input
            type="range"
            min="0.5"
            max="50"
            step="0.5"
            :value="radiusKm"
            @input="$emit('update:radiusKm', +$event.target.value)"
            class="slider"
          />
          <input
            type="number"
            min="0.5"
            max="50"
            step="0.1"
            :value="radiusKm"
            @input="onManualRadius($event)"
            class="radius-input"
            aria-label="شعاع جستجو"
          />
          <span class="radius-unit">km</span>
        </div>
      </div>

      <div class="sq__info mono" v-if="radiusCenter">
        مرکز: {{ radiusCenter.lat?.toFixed(5) }},
        {{ radiusCenter.lng?.toFixed(5) }}
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
        <label>شعاع جستجو: <span class="mono accent">{{ radiusKm }} km</span></label>
        <div class="radius-control">
          <input
            type="range"
            min="0.5"
            max="50"
            step="0.5"
            :value="radiusKm"
            @input="$emit('update:radiusKm', +$event.target.value)"
            class="slider"
          />
          <input
            type="number"
            min="0.5"
            max="50"
            step="0.1"
            :value="radiusKm"
            @input="onManualRadius($event)"
            class="radius-input"
            aria-label="شعاع جستجو"
          />
          <span class="radius-unit">km</span>
        </div>
      </div>
    </div>
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
  fields: { type: Array, default: () => [] },
  customPoint: { type: Object, default: null },
  isPicking: { type: Boolean, default: false },
});

const emit = defineEmits([
  "update:mode",
  "update:radiusCenter",
  "update:radiusKm",
  "pick-point",
  "clear-point",
]);

const wellsWithCoords = computed(() =>
  props.wells.filter((w) => w.lat && w.lng),
);

const firstLabelField = computed(() =>
  props.fields.length ? props.fields[0] : null,
);

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
  emit("update:radiusCenter", well || null);
}

function onManualRadius(e) {
  let val = parseFloat(e.target.value);
  if (Number.isNaN(val)) return;
  if (val < 0.5) val = 0.5;
  if (val > 50) val = 50;
  emit("update:radiusKm", val);
}
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
.sq__info {
  font-size: 11px;
  color: var(--text-muted);
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px 10px;
  direction: ltr;
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
  width: 74px;
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
</style>

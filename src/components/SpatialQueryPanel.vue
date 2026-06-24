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
        <select
          :value="radiusCenter?.id || ''"
          @change="onCenterChange"
          class="qb-select qb-select--full"
        >
          <option value="" disabled>یک عارضه انتخاب کنید…</option>
          <option v-for="w in wellsWithCoords" :key="w.id" :value="w.id">
            #{{ w.id }}
            <template v-if="firstLabelField"> — {{ w[firstLabelField] }}</template>
          </option>
        </select>
      </div>

      <div class="field-group">
        <label>شعاع جستجو: <span class="mono accent">{{ radiusKm }} km</span></label>
        <input
          type="range"
          min="0.5"
          max="50"
          step="0.5"
          :value="radiusKm"
          @input="$emit('update:radiusKm', +$event.target.value)"
          class="slider"
        />
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
        <input
          type="range"
          min="0.5"
          max="50"
          step="0.5"
          :value="radiusKm"
          @input="$emit('update:radiusKm', +$event.target.value)"
          class="slider"
        />
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";

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

function onCenterChange(e) {
  const well = props.wells.find((w) => String(w.id) === e.target.value);
  emit("update:radiusCenter", well || null);
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
  gap: 6px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-md);
  border: 1px solid var(--border-subtle);
}
.sq__tab {
  flex: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12.5px;
  padding: 8px 6px;
  border-radius: var(--radius-sm);
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.sq__tab:hover:not(.sq__tab--active) {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
}
.sq__tab--active {
  background: var(--bg-panel-raised);
  color: var(--text-primary);
  font-weight: 700;
  box-shadow: inset 0 0 0 1px var(--border-strong);
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
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 12.5px;
  padding: 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.qb-select--full {
  width: 100%;
}
.slider {
  width: 100%;
  accent-color: var(--accent-depth);
  height: 4px;
  cursor: pointer;
}

.btn-pick {
  width: 100%;
  padding: 9px 14px;
  background: var(--bg-input);
  border: 1.5px dashed var(--border-strong);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  font-size: 13px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.btn-pick:hover:not(.btn-pick--active) {
  border-color: var(--accent-depth);
  color: var(--accent-depth);
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

<template>
  <div class="qs" v-if="hasAnySummary">
    <div class="qs__header">
      <span class="qs__title">خلاصه کوئری</span>
      <button class="qs__clear-all" @click="$emit('clear-all')" title="پاک کردن همه شرط‌ها">
        پاک کردن همه
      </button>
    </div>

    <div class="qs__layers">
      <div
        v-for="item in summaryItems"
        :key="item.layerUuid"
        class="qs__layer-block"
      >
        <!-- نام لایه -->
        <div class="qs__layer-name">
          <span class="qs__dot" :style="{ background: item.color }"></span>
          <span class="qs__name-text">{{ item.layerName }}</span>
          <span class="qs__badge">{{ item.conditions.length }} شرط</span>
        </div>

        <!-- خط SQL-like -->
        <div class="qs__sql">
          <span class="qs__kw">SELECT</span>
          <span class="qs__sym"> * </span>
          <span class="qs__kw">FROM</span>
          <span class="qs__table"> {{ item.layerName }} </span>
          <span class="qs__kw">WHERE</span>
          <span class="qs__clause">
            <template v-for="(cond, idx) in item.conditions" :key="idx">
              <span v-if="idx > 0" class="qs__logic">{{ cond.logic }}</span>
              <span v-if="cond.not" class="qs__not">NOT</span>
              <span class="qs__field">{{ cond.fieldLabel }}</span>
              <span class="qs__op">{{ cond.opLabel }}</span>
              <span class="qs__val">{{ cond.value }}</span>
            </template>
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  // آرایه‌ای از { layerUuid, layerName, color, conditions: [...], fields: [...] }
  layerSummaries: { type: Array, default: () => [] },
})

defineEmits(['clear-all'])

const OP_LABELS = {
  '=': '=',
  '!=': '≠',
  '>': '>',
  '>=': '≥',
  '<': '<',
  '<=': '≤',
  contains: 'LIKE',
}

const summaryItems = computed(() =>
  props.layerSummaries
    .map(layer => {
      const activeConds = layer.conditions.filter(c => c.value !== '' && c.value !== null && c.value !== undefined)
      if (!activeConds.length) return null

      return {
        layerUuid: layer.layerUuid,
        layerName: layer.layerName,
        color: layer.color,
        conditions: activeConds.map((c, i) => ({
          logic: c.logic || 'AND',
          not: c.not,
          fieldLabel: layer.fields.find(f => f.key === c.field)?.label ?? c.field,
          opLabel: OP_LABELS[c.operator] ?? c.operator,
          value: c.value,
        })),
      }
    })
    .filter(Boolean)
)

const hasAnySummary = computed(() => summaryItems.value.length > 0)
</script>

<style scoped>
.qs {
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 12px;
}

.qs__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.qs__title {
  font-size: 11px;
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.qs__clear-all {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-size: 10.5px;
  padding: 3px 8px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}
.qs__clear-all:hover {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}

.qs__layers {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.qs__layer-block {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.qs__layer-name {
  display: flex;
  align-items: center;
  gap: 6px;
}

.qs__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.qs__name-text {
  font-weight: 600;
  color: var(--text-primary);
  font-size: 12px;
}

.qs__badge {
  font-size: 10px;
  background: color-mix(in srgb, var(--accent-depth) 15%, transparent);
  color: var(--accent-depth);
  padding: 1px 6px;
  border-radius: 20px;
  font-weight: 600;
}

/* خط SQL */
.qs__sql {
  direction: ltr;
  text-align: left;
  background: var(--bg-input);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 7px 10px;
  font-family: var(--font-mono);
  font-size: 11.5px;
  line-height: 1.8;
  white-space: pre-wrap;
  word-break: break-all;
  overflow-x: auto;
}

.qs__kw  { color: #7ec8e3; font-weight: 700; }    /* کلمات کلیدی SQL آبی */
.qs__sym { color: var(--text-muted); }
.qs__table { color: #e9c46a; font-weight: 600; }  /* نام جدول طلایی */
.qs__clause { color: var(--text-primary); }
.qs__logic { color: #7ec8e3; font-weight: 700; margin: 0 4px; }
.qs__not   { color: #e76f51; font-weight: 700; margin: 0 4px; }
.qs__field { color: #a8dadc; }                     /* نام فیلد فیروزه‌ای */
.qs__op    { color: var(--text-muted); margin: 0 4px; }
.qs__val   { color: #f4a261; }                     /* مقدار نارنجی */
</style>
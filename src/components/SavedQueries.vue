<template>
  <div class="sv">
    <h3>کوئری‌های ذخیره‌شده</h3>
    <div v-if="queries.length" class="sv__list">
      <div v-for="q in queries" :key="q.id" class="sv__item">
        <button class="sv__load" @click="$emit('load', q)">
          <span class="sv__name">{{ q.name }}</span>
          <div class="sv__meta-row">
            <span class="sv__layer mono">{{ q.layerName || '—' }}</span>
            <span class="sv__cond mono">{{ q.conditions.length }} شرط</span>
          </div>
        </button>
        <button class="sv__delete" @click="$emit('delete', q.id)" title="حذف">×</button>
      </div>
    </div>
    <p v-else class="sv__empty">هنوز کوئری‌ای ذخیره نشده است</p>
  </div>
</template>

<script setup>
defineProps({ queries: { type: Array, required: true } })
defineEmits(['load', 'delete'])
</script>

<style scoped>
.sv { display: flex; flex-direction: column; gap: 10px; }
.sv h3 { margin: 0; font-size: 14px; font-weight: 700; }
.sv__list { display: flex; flex-direction: column; gap: 6px; }
.sv__item { display: flex; align-items: stretch; gap: 6px; }
.sv__load {
  flex: 1; display: flex; flex-direction: column; align-items: flex-start; gap: 4px;
  background: var(--bg-input); border: 1px solid var(--border-subtle);
  color: var(--text-primary); padding: 9px 12px; border-radius: var(--radius-sm);
  font-size: 12.5px; text-align: right;
}
.sv__load:hover { border-color: var(--accent-copper); background: var(--bg-panel-raised); }
.sv__name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.sv__meta-row { display: flex; gap: 8px; align-items: center; }
.sv__layer { color: var(--accent-depth); font-size: 10.5px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 120px; }
.sv__cond { color: var(--text-muted); font-size: 10.5px; flex-shrink: 0; }
.sv__delete {
  background: transparent; border: 1px solid var(--border-subtle);
  color: var(--text-muted); width: 32px; border-radius: var(--radius-sm); font-size: 15px; flex-shrink: 0;
}
.sv__delete:hover { border-color: var(--accent-danger); color: var(--accent-danger); }
.sv__empty { font-size: 12px; color: var(--text-muted); margin: 0; padding: 10px 0; }
</style>

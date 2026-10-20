<template>
  <div class="qh">
    <div class="qh__header">
      <span class="qh__title">تاریخچه کوئری‌ها</span>
      <button
        v-if="entries.length"
        class="qh__clear"
        @click="$emit('clear')"
        title="پاک کردن تاریخچه"
      >
        پاک کردن
      </button>
    </div>

    <div v-if="entries.length" class="qh__list">
      <div v-for="e in entries" :key="e.id" class="qh__item">
        <button class="qh__main" :title="e.label" @click="$emit('rerun', e)">
          <span class="qh__label">{{ e.label }}</span>
          <span class="qh__meta mono">
            {{ timeOf(e.at) }}
            <template v-if="e.count != null && e.count !== 0"> · {{ e.count.toLocaleString('fa-IR') }} عارضه</template>
          </span>
        </button>
        <div class="qh__actions">
          <button
            class="qh__action-btn qh__action-btn--run"
            :disabled="running"
            @click="$emit('rerun', e)"
            :title="running ? 'در حال اجرا…' : 'اجرای مجدد این کوئری'"
            :aria-label="'اجرای مجدد ' + e.label"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 2.6-6.4"/>
              <polyline points="3 4 3 9 8 9"/>
            </svg>
          </button>
          <button
            v-if="toc"
            class="qh__action-btn qh__action-btn--save"
            :disabled="exporting"
            @click="$emit('export-shp', e)"
            title="خروجی نتیجه این کوئری به‌صورت Shapefile"
            aria-label="ذخیره نتیجه به‌صورت Shapefile"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
              <polyline points="7 10 12 15 17 10"/>
              <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
          </button>
          <button
            class="qh__action-btn qh__action-btn--delete"
            @click="$emit('remove', e.id)"
            title="حذف از تاریخچه"
            aria-label="حذف از تاریخچه"
          >
            <span>×</span>
          </button>
        </div>
      </div>
    </div>
    <p v-else class="qh__empty">هنوز کوئری‌ای اجرا نشده است</p>
  </div>
</template>

<script setup>
defineProps({
  entries: { type: Array, default: () => [] },
  // حالت TOC: دکمه ذخیره (خروجی Shapefile) هم دارد؛ در پنل‌های کوئری فقط تکرار اجرا
  toc: { type: Boolean, default: false },
  running: { type: Boolean, default: false },
  exporting: { type: Boolean, default: false },
})
defineEmits(['rerun', 'export-shp', 'remove', 'clear'])

function timeOf(ts) {
  try {
    const d = new Date(ts)
    return d.toLocaleTimeString('fa-IR', { hour: '2-digit', minute: '2-digit' }) + ' — ' + d.toLocaleDateString('fa-IR', { month: '2-digit', day: '2-digit' })
  } catch {
    return ''
  }
}
</script>

<style scoped>
.qh { display: flex; flex-direction: column; gap: 8px; }
.qh__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.qh__title {
  font-size: 12px;
  font-weight: 700;
  color: var(--text-secondary);
}
.qh__clear {
  background: transparent;
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  font-weight: 600;
  font-family: inherit;
  padding: 3px 10px;
  border-radius: var(--radius-xs);
  cursor: pointer;
  white-space: nowrap;
}
.qh__clear:hover {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}
.qh__list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-height: 240px;
  overflow-y: auto;
}
.qh__item {
  display: flex;
  align-items: stretch;
  gap: 4px;
}
.qh__main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 2px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  color: var(--text-primary);
  padding: 7px 10px;
  border-radius: var(--radius-sm);
  font-size: 12px;
  text-align: right;
  font-family: inherit;
  cursor: pointer;
}
.qh__main:hover {
  border-color: var(--border-strong);
  background: var(--bg-hover);
}
.qh__label {
  font-weight: 600;
  font-size: 11.5px;
  line-height: 1.6;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-align: right;
  width: 100%;
}
.qh__meta {
  color: var(--text-muted);
  font-size: 10.5px;
  direction: ltr;
  align-self: flex-end;
  white-space: nowrap;
}
.qh__actions {
  display: flex;
  flex-direction: column;
  gap: 3px;
  flex-shrink: 0;
}
.qh__action-btn {
  width: 30px;
  height: 30px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
  font-size: 15px;
  line-height: 1;
  padding: 0;
}
.qh__action-btn:hover:not(:disabled) {
  background: var(--bg-panel);
  border-color: var(--border-strong);
}
.qh__action-btn--run:hover:not(:disabled) { color: var(--brand); }
.qh__action-btn--save:hover:not(:disabled) { color: #0891b2; }
.qh__action-btn--delete:hover:not(:disabled) {
  color: var(--accent-danger);
  border-color: var(--accent-danger);
}
.qh__action-btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}
.qh__empty {
  font-size: 11.5px;
  color: var(--text-muted);
  margin: 0;
  font-style: italic;
  text-align: center;
  padding: 6px 0;
}

/* نسخه فشرده TOC (پنل باریک راست) */
.qh--toc .qh__list { max-height: 300px; }
.qh--toc .qh__label { font-size: 11px; }
</style>

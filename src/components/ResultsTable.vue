<template>
  <div class="rt" :class="{ 'rt--single': !hasTabs, 'rt--multi': hasTabs }">
    <!-- تب‌های لایه‌ها (برای هر لایه فعال یک تب) -->
    <div v-if="hasTabs" class="rt__tabs" role="tablist" aria-label="لایه‌ها">
      <button
        v-for="g in layerGroups"
        :key="g.uuid"
        class="rt__tab"
        :class="{ 'rt__tab--active': activeTab === g.uuid }"
        role="tab"
        :aria-selected="activeTab === g.uuid"
        @click="selectTab(g.uuid)"
      >
        <span class="rt__tab-dot" :style="{ background: g.color }"></span>
        <span class="rt__tab-label">{{ g.name }}</span>
        <span class="rt__tab-count mono">{{ g.rows.length.toLocaleString('fa-IR') }}</span>
      </button>
    </div>

    <div class="rt__table-wrap rt__table-wrap--single" v-if="effectiveRows.length">
      <div class="rt__scroll">
        <table class="rt__table" :style="tableStyle(effectiveColumns)">
          <thead>
            <tr>
              <th
                v-for="col in effectiveColumns"
                :key="col.key"
                :style="cellStyle(col)"
                :title="col.label"
              >
                <span class="rt__th-label">{{ col.label }}</span>
                <span
                  class="rt__resizer"
                  @pointerdown="onResizeStart($event, col)"
                  @dblclick="onResizeReset(col)"
                  @click.stop
                  title="تغییر عرض ستون (دابل‌کلیک برای ریست)"
                ></span>
              </th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in pagedRows"
              :key="rowKeyOf(row)"
              class="rt__row"
              :class="{ 'rt__row--active': isActive(row) }"
              @click="$emit('select', row)"
              @mouseenter="$emit('hover', row)"
            >
              <td
                v-for="col in effectiveColumns"
                :key="col.key"
                :class="{ mono: col.mono }"
                :style="cellStyle(col)"
                :title="cellTitle(row, col)"
              >
                {{ formatCell(row, col) }}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <!-- صفحه‌بندی پیشرفته -->
      <div v-if="totalPages > 1 || pageSizeOptions.length > 1" class="rt__pager">
        <div class="rt__pager-right">
          <span class="rt__total-rows mono">{{ effectiveRows.length.toLocaleString('fa-IR') }} ردیف</span>
          <div v-if="pageSizeOptions.length > 1" class="rt__page-size">
            <label class="rt__page-size-label">ردیف در صفحه:</label>
            <select class="rt__page-size-select" :value="pageSize" @change="onPageSizeChange">
              <option v-for="s in pageSizeOptions" :key="s" :value="s">{{ s }}</option>
            </select>
          </div>
        </div>
        <div v-if="totalPages > 1" class="rt__pager-center">
          <button class="rt__page-btn rt__page-btn--icon" :disabled="page <= 1" @click="firstPage" title="صفحه اول">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/><line x1="6" y1="4" x2="6" y2="20"/></svg>
          </button>
          <button class="rt__page-btn rt__page-btn--icon" :disabled="page <= 1" @click="prevPage" title="صفحه قبل">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
          <template v-for="p in pageNumbers" :key="'p'+p">
            <span v-if="p === '...'" class="rt__page-ellipsis">...</span>
            <button
              v-else
              class="rt__page-num"
              :class="{ 'rt__page-num--active': p === page }"
              @click="goToPage(p)"
            >{{ p.toLocaleString('fa-IR') }}</button>
          </template>
          <button class="rt__page-btn rt__page-btn--icon" :disabled="page >= totalPages" @click="nextPage" title="صفحه بعد">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="rt__page-btn rt__page-btn--icon" :disabled="page >= totalPages" @click="lastPage" title="صفحه آخر">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="4" x2="18" y2="20"/><polyline points="13 17 18 12 13 7"/></svg>
          </button>
        </div>
        <div v-if="totalPages > 1" class="rt__pager-left">
          <span class="rt__page-info mono">{{ page.toLocaleString('fa-IR') }} / {{ totalPages.toLocaleString('fa-IR') }}</span>
          <div class="rt__jump">
            <label class="rt__jump-label">رفتن به:</label>
            <input
              class="rt__jump-input mono"
              type="number"
              :min="1"
              :max="totalPages"
              :value="page"
              @keydown.enter="onJumpEnter"
              @blur="onJumpBlur"
            />
          </div>
        </div>
      </div>
    </div>
    <div v-else class="rt__empty">
      نتیجه‌ای با شرایط فعلی یافت نشد. شرط‌ها یا شعاع جستجو را تغییر دهید.
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { layerColor, formatFaNumber } from '../composables/useLayerColors.js'

const props = defineProps({
  rows:      { type: Array,  required: true },
  columns:   { type: Array,  required: true },
  activeId:  { type: String, default: null },
  layerMeta: { type: Array,  default: () => [] },
})
defineEmits(['select', 'hover', 'export'])

const PAGE_SIZE_OPTIONS = [25, 50, 100, 200]
const pageSize = ref(100)
const pageSizeOptions = PAGE_SIZE_OPTIONS
const page = ref(1)
const activeTab = ref('')

const layerGroups = computed(() => {
  if (!props.layerMeta.length) return []
  return props.layerMeta.map((meta, idx) => {
    const layerRows = props.rows.filter(r => r._layerUuid === meta.uuid)
    const cols = [{ key: 'id', label: 'شناسه', mono: true }]
    if (layerRows.some(r => 'distanceKm' in r)) {
      cols.push({ key: 'distanceKm', label: 'فاصله (km)', mono: false })
    }
    cols.push(...(meta.fields ?? []).map(f => ({ key: f.key, label: f.label })))
    return {
      uuid:    meta.uuid,
      name:    meta.name,
      color:   meta.color ?? layerColor(meta.uuid, idx),
      rows:    layerRows,
      columns: cols,
    }
  })
})
const hasTabs = computed(() => layerGroups.value.length > 0)
const isMulti = computed(() => layerGroups.value.length > 1)

const activeGroup = computed(() =>
  layerGroups.value.find(g => g.uuid === activeTab.value) ?? layerGroups.value[0] ?? null
)
const effectiveRows = computed(() =>
  isMulti.value ? (activeGroup.value?.rows ?? []) : props.rows
)
const effectiveColumns = computed(() =>
  isMulti.value ? (activeGroup.value?.columns ?? []) : props.columns
)

function selectTab(uuid) {
  activeTab.value = uuid
  page.value = 1
}

watch(() => props.rows, () => {
  page.value = 1
  const first = layerGroups.value[0]
  if (first) activeTab.value = first.uuid
})
watch(() => props.layerMeta, () => {
  const first = layerGroups.value[0]
  if (first) activeTab.value = first.uuid
})
watch(activeTab, () => {
  page.value = 1
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(effectiveRows.value.length / pageSize.value))
)
const pagedRows = computed(() =>
  effectiveRows.value.slice((page.value - 1) * pageSize.value, page.value * pageSize.value)
)
function nextPage() { if (page.value < totalPages.value) page.value++ }
function prevPage() { if (page.value > 1) page.value-- }
function firstPage() { page.value = 1 }
function lastPage() { page.value = totalPages.value }
function goToPage(p) {
  if (typeof p === 'number' && p >= 1 && p <= totalPages.value) page.value = p
}

const pageNumbers = computed(() => {
  const tp = totalPages.value
  const cp = page.value
  if (tp <= 7) return Array.from({ length: tp }, (_, i) => i + 1)
  const pages = []
  pages.push(1)
  if (cp > 3) pages.push('...')
  const start = Math.max(2, cp - 1)
  const end = Math.min(tp - 1, cp + 1)
  for (let i = start; i <= end; i++) pages.push(i)
  if (cp < tp - 2) pages.push('...')
  pages.push(tp)
  return pages
})

function onPageSizeChange(e) {
  const val = Number(e.target.value)
  if (!Number.isFinite(val) || val < 1) return
  const oldFirst = (page.value - 1) * pageSize.value
  pageSize.value = val
  page.value = Math.max(1, Math.floor(oldFirst / val) + 1)
}

function onJumpEnter(e) {
  goToPage(Number(e.target.value))
  e.target.blur()
}
function onJumpBlur(e) {
  e.target.value = page.value
}

/* ---------- عرض ستون‌ها (اکسل‌مانند) ---------- */
const LS_KEY = 'wq:col-widths-v1'
const MIN_W = 70
const MAX_W = 800

function defaultWidth(col) {
  if (col.key === 'id') return 110
  if (col.key === 'distanceKm') return 135
  return 170
}

function loadWidths() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return {}
    const o = JSON.parse(raw)
    return (o && typeof o === 'object') ? o : {}
  } catch { return {} }
}
const colWidths = ref(loadWidths())

function persist() {
  try { localStorage.setItem(LS_KEY, JSON.stringify(colWidths.value)) } catch {}
}

function widthFor(col) {
  const w = Number(colWidths.value[col.key])
  return Number.isFinite(w) ? Math.min(MAX_W, Math.max(MIN_W, w)) : defaultWidth(col)
}
function cellStyle(col) {
  const w = widthFor(col)
  return { width: w + 'px', minWidth: w + 'px', maxWidth: w + 'px' }
}
function tableStyle(cols) {
  const total = (cols ?? []).reduce((s, c) => s + widthFor(c), 0)
  return { width: total + 'px', minWidth: '100%' }
}

function onResizeStart(e, col) {
  e.preventDefault()
  e.stopPropagation()
  const th = e.target.closest('th')
  const isRTL = th ? getComputedStyle(th).direction === 'rtl' : true
  const startX = e.clientX
  const startW = widthFor(col)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  const move = (ev) => {
    const dx = ev.clientX - startX
    const delta = isRTL ? -dx : dx
    const nw = Math.min(MAX_W, Math.max(MIN_W, startW + delta))
    colWidths.value = { ...colWidths.value, [col.key]: Math.round(nw) }
  }
  const up = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', up)
    window.removeEventListener('pointercancel', up)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
    persist()
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', up)
  window.addEventListener('pointercancel', up)
}
function onResizeReset(col) {
  const next = { ...colWidths.value }
  delete next[col.key]
  colWidths.value = next
  persist()
}

function formatCell(row, col) {
  const val = row[col.key]
  if (col.key === 'distanceKm') {
    if (val === undefined || val === null) return '—'
    const n = Number(val)
    return Number.isFinite(n) ? `${n.toLocaleString('fa-IR', { maximumFractionDigits: 2 })} کیلومتر` : '—'
  }
  if (typeof val === 'boolean') return val ? 'بله' : 'خیر'
  if (val === null || val === undefined) return '—'
  if (typeof val === 'number') return formatFaNumber(val)
  return val
}
function cellTitle(row, col) {
  try { return String(formatCell(row, col)) } catch { return '' }
}

function rowKeyOf(row) {
  return row._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? '')
}
function isActive(row) {
  if (props.activeId == null || props.activeId === '') return false
  if (String(rowKeyOf(row)) === String(props.activeId)) return true
  return String(row.id) === String(props.activeId)
}
</script>

<style scoped>
.rt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-height: 0;
  min-width: 0;
}
/* جدول: بدون اسکرول عمودی بیرونی — اسکرول داخلی، ستون اول چسبان */
.rt--single,
.rt--multi { overflow: hidden; }

/* ---------- تب‌های لایه‌ها ---------- */
.rt__tabs {
  display: flex;
  gap: 6px;
  padding: 8px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow-x: auto;
  overflow-y: hidden;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 5;
}
.rt__tab {
  position: relative;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 13px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 12px;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  user-select: none;
  transition:
    background-color 0.2s var(--ease-out),
    color 0.2s var(--ease-out),
    border-color 0.2s var(--ease-out);
}
.rt__tab:hover {
  color: var(--text-primary);
  background: var(--bg-hover);
}
.rt__tab--active {
  background: var(--bg-panel);
  border-color: var(--border-strong);
  color: var(--brand);
  font-weight: 700;
  box-shadow: var(--shadow-xs);
}
.rt__tab--active::after {
  content: '';
  position: absolute;
  inset-inline: 10px;
  bottom: -8px;
  height: 3px;
  border-radius: 3px 3px 0 0;
  background: var(--brand);
  box-shadow: 0 1px 3px var(--ring-color);
}
.rt__tab-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; transition: transform 0.2s var(--ease-out); }
.rt__tab--active .rt__tab-dot { transform: scale(1.15); }
.rt__tab-label { max-width: 180px; overflow: hidden; text-overflow: ellipsis; }
.rt__tab-count {
  font-size: 10.5px;
  color: var(--text-muted);
  direction: ltr;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-full);
  padding: 1px 7px;
  line-height: 1.6;
}
.rt__tab--active .rt__tab-count {
  color: var(--brand-strong);
  background: var(--brand-soft);
  border-color: transparent;
}

/* ---------- جدول + اسکرول چسبان ---------- */
.rt__table-wrap {
  overflow: auto;
  max-height: 46vh;
  min-width: 0;
}
.rt__table-wrap--single {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  flex: 1;
  min-height: 0;
  max-height: none;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.rt--multi .rt__table-wrap--single {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
}
.rt__scroll {
  flex: 1;
  min-height: 0;
  overflow: auto;
}
.rt__table {
  border-collapse: separate;
  border-spacing: 0;
  font-size: 12.5px;
  table-layout: fixed;
}
.rt__table thead {
  position: sticky;
  top: 0;
  background: var(--bg-panel-raised);
  z-index: 2;
}
.rt__table thead th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--bg-panel-raised);
}
.rt__table th {
  text-align: start;
  padding: 8px 12px;
  padding-inline-end: 20px;
  font-weight: 700;
  color: var(--text-secondary);
  font-size: 11px;
  border-bottom: 1px solid var(--border-strong);
  white-space: nowrap;
  overflow: hidden;
  position: relative;
  user-select: none;
}
.rt__th-label {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rt__table td {
  padding: 7px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ---------- ستون اول چسبان هنگام اسکرول افقی ---------- */
.rt__table thead th:first-child,
.rt__table tbody td:first-child {
  position: sticky;
  inset-inline-start: 0;
  z-index: 3;
}
.rt__table thead th:first-child {
  z-index: 4;
  background: var(--bg-panel-raised);
  border-inline-end: 1px solid var(--border-strong);
}
.rt__table tbody td:first-child {
  background: var(--bg-panel);
  border-inline-end: 1px solid var(--border-subtle);
}
.rt__row:hover td:first-child { background: var(--bg-hover); }
.rt__row--active td:first-child { background: var(--brand-soft); }

/* دستگیره تغییر عرض — مثل اکسل */
.rt__resizer {
  position: absolute;
  inset-inline-end: 0;
  top: 0;
  bottom: 0;
  width: 12px;
  cursor: col-resize;
  touch-action: none;
  z-index: 6;
}
.rt__resizer::after {
  content: '';
  position: absolute;
  inset-inline-end: 4px;
  top: 6px;
  bottom: 6px;
  width: 2px;
  border-radius: 2px;
  background: transparent;
  transition: background 0.12s;
}
.rt__table th:hover .rt__resizer::after { background: var(--border-strong); }
.rt__resizer:hover::after,
.rt__resizer:active::after { background: var(--brand) !important; }
.rt__row {
  cursor: pointer;
}
.rt__row:hover { background: var(--bg-hover); }
.rt__row--active { background: var(--brand-soft); }
.rt__row--active td:first-child { box-shadow: inset 3px 0 0 var(--brand); }

.rt__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 12.5px;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  background: var(--bg-panel-raised);
  line-height: 1.8;
}
.rt__pager {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 12px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-panel);
  position: sticky;
  bottom: 0;
  z-index: 2;
  flex-shrink: 0;
}
.rt__pager-right,
.rt__pager-left {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-shrink: 0;
}
.rt__pager-center {
  display: flex;
  align-items: center;
  gap: 4px;
  flex-shrink: 0;
}
.rt__page-btn {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  padding: 5px 12px;
  border-radius: var(--radius-sm);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  transition:
    border-color 0.15s var(--ease-out),
    color 0.15s var(--ease-out),
    background-color 0.15s var(--ease-out);
}
.rt__page-btn--icon { padding: 5px 8px; }
.rt__page-btn:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand);
  background: var(--brand-soft);
}
.rt__page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.rt__page-ellipsis { color: var(--text-muted); font-size: 12px; padding: 0 2px; user-select: none; }
.rt__page-num {
  min-width: 30px;
  height: 30px;
  padding: 0 6px;
  border: 1px solid transparent;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  font-weight: 600;
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  transition:
    border-color 0.15s var(--ease-out),
    color 0.15s var(--ease-out),
    background-color 0.15s var(--ease-out);
}
.rt__page-num:hover:not(.rt__page-num--active) {
  border-color: var(--border-strong);
  color: var(--brand);
  background: var(--bg-hover);
}
.rt__page-num--active {
  background: var(--brand);
  border-color: var(--brand-strong);
  color: #fff;
  box-shadow: var(--shadow-xs);
  cursor: default;
}
.rt__total-rows {
  font-size: 11px;
  color: var(--text-muted);
  white-space: nowrap;
}
.rt__page-size {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rt__page-size-label { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.rt__page-size-select {
  height: 28px;
  padding: 0 24px 0 8px;
  font-size: 11.5px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background-color: var(--bg-panel);
}
.rt__page-info { font-size: 11.5px; color: var(--text-muted); direction: ltr; white-space: nowrap; }
.rt__jump {
  display: flex;
  align-items: center;
  gap: 6px;
}
.rt__jump-label { font-size: 11px; color: var(--text-muted); white-space: nowrap; }
.rt__jump-input {
  width: 58px;
  height: 28px;
  padding: 0 8px;
  font-size: 12px;
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  background: var(--bg-panel);
  color: var(--text-primary);
  text-align: center;
}
.rt__jump-input:focus {
  border-color: var(--brand);
  outline: none;
  box-shadow: 0 0 0 2px var(--ring-color);
}

@media (max-width: 760px) {
  .rt__tab-label { max-width: 120px; }
  .rt__pager { flex-wrap: wrap; justify-content: center; gap: 8px; padding: 8px; }
  .rt__pager-right { width: 100%; justify-content: center; }
  .rt__pager-left { order: 3; }
}
</style>
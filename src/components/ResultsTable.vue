<template>
  <div class="rt" :class="{ 'rt--single': !isMulti, 'rt--multi': isMulti }">
    <!-- حالت چند لایه: هر لایه جداگانه -->
    <template v-if="isMulti">
      <div
        v-for="group in layerGroups"
        :key="group.uuid"
        class="rt__layer-group"
      >
        <button class="rt__layer-header" @click="toggleGroup(group.uuid)" :aria-expanded="!collapsedGroups.has(group.uuid)">
          <span class="rt__layer-dot" :style="{ background: group.color }"></span>
          <span class="rt__layer-title">{{ group.name }}</span>
          <span class="rt__layer-count mono">{{ group.rows.length.toLocaleString('fa-IR') }} عارضه</span>
          <span class="rt__layer-chevron" aria-hidden="true">{{ collapsedGroups.has(group.uuid) ? '▼' : '▲' }}</span>
        </button>

        <div class="rt__table-wrap" v-show="!collapsedGroups.has(group.uuid)">
          <table class="rt__table" v-if="group.rows.length" :style="tableStyle(group.columns)">
            <thead>
              <tr>
                <th
                  v-for="col in group.columns"
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
                v-for="row in groupVisibleRows(group)"
                :key="row._layerUuid + '::' + row.id"
                class="rt__row"
                :class="{ 'rt__row--active': isActive(row) }"
                @click="$emit('select', row)"
                @mouseenter="$emit('hover', row)"
              >
                <td
                  v-for="col in group.columns"
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
          <div v-else class="rt__empty-layer">نتیجه‌ای یافت نشد</div>
          <button
            v-if="group.rows.length > visibleCount(group)"
            class="rt__more-btn"
            @click="showMore(group)"
          >
            نمایش {{ Math.min(PAGE_SIZE, group.rows.length - visibleCount(group)).toLocaleString('fa-IR') }} رکورد بیشتر ({{ visibleCount(group).toLocaleString('fa-IR') }} از {{ group.rows.length.toLocaleString('fa-IR') }})
          </button>
        </div>
      </div>
    </template>

    <!-- حالت تک‌لایه یا spatial -->
    <template v-else>
      <div class="rt__table-wrap rt__table-wrap--single" v-if="rows.length">
        <div class="rt__scroll">
          <table class="rt__table" :style="tableStyle(columns)">
            <thead>
              <tr>
                <th
                  v-for="col in columns"
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
                :key="row._layerUuid + '::' + row.id"
                class="rt__row"
                :class="{ 'rt__row--active': isActive(row) }"
                @click="$emit('select', row)"
                @mouseenter="$emit('hover', row)"
              >
                <td
                  v-for="col in columns"
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
        <div v-if="totalPages > 1" class="rt__pager">
          <button class="rt__page-btn" :disabled="page <= 1" @click="prevPage">قبلی</button>
          <span class="rt__page-info mono">{{ page.toLocaleString('fa-IR') }} / {{ totalPages.toLocaleString('fa-IR') }}</span>
          <button class="rt__page-btn" :disabled="page >= totalPages" @click="nextPage">بعدی</button>
        </div>
      </div>
      <div v-else class="rt__empty">
        نتیجه‌ای با شرایط فعلی یافت نشد. شرط‌ها یا شعاع جستجو را تغییر دهید.
      </div>
    </template>
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

const PAGE_SIZE = 100
const page = ref(1)
const expandedPerGroup = ref({})

watch(() => props.rows, () => {
  page.value = 1
  expandedPerGroup.value = {}
})

const totalPages = computed(() =>
  Math.max(1, Math.ceil(props.rows.length / PAGE_SIZE))
)
const pagedRows = computed(() =>
  props.rows.slice((page.value - 1) * PAGE_SIZE, page.value * PAGE_SIZE)
)
function nextPage() { if (page.value < totalPages.value) page.value++ }
function prevPage() { if (page.value > 1) page.value-- }

function visibleCount(group) {
  return expandedPerGroup.value[group.uuid] ?? PAGE_SIZE
}
function groupVisibleRows(group) {
  return group.rows.slice(0, visibleCount(group))
}
function showMore(group) {
  expandedPerGroup.value = {
    ...expandedPerGroup.value,
    [group.uuid]: visibleCount(group) + PAGE_SIZE,
  }
}

const layerGroups = computed(() => {
  if (!props.layerMeta.length) return []
  return props.layerMeta.map((meta, idx) => {
    const layerRows = props.rows.filter(r => r._layerUuid === meta.uuid)
    const layerCols = [
      { key: 'id', label: 'شناسه', mono: true },
      ...(meta.fields ?? []).slice(0, 5).map(f => ({ key: f.key, label: f.label })),
    ]
    return {
      uuid:    meta.uuid,
      name:    meta.name,
      color:   meta.color ?? layerColor(meta.uuid, idx),
      rows:    layerRows,
      columns: layerCols,
    }
  })
})
const isMulti = computed(() => layerGroups.value.length > 1)

const collapsedGroups = ref(new Set())
function toggleGroup(uuid) {
  const s = new Set(collapsedGroups.value)
  s.has(uuid) ? s.delete(uuid) : s.add(uuid)
  collapsedGroups.value = s
}

/* ---------- عرض ستون‌ها (اکسل‌مانند) ---------- */
const LS_KEY = 'wq:col-widths-v1'
const MIN_W = 70
const MAX_W = 800

function defaultWidth(col) {
  if (col.key === 'id') return 110
  if (col.key === '_layerName') return 150
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

function isActive(row) {
  if (props.activeId == null || props.activeId === '') return false
  if (String(rowKey(row)) === String(props.activeId)) return true
  return String(row.id) === String(props.activeId)
}
function rowKey(row) {
  return row._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? '')
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
/* تک‌جدوله: بدون اسکرول عمودی بیرونی — اسکرول داخلی */
.rt--single { overflow: hidden; }
/* چندلایه: اسکرول عمودی خود جدول، هدر هر لایه چسبان */
.rt--multi { overflow-y: auto; overflow-x: hidden; }

/* ---------- گروه لایه ---------- */
.rt__layer-group {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  overflow: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.rt__layer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  font-family: inherit;
  padding: 8px 12px;
  background: var(--bg-panel-raised);
  cursor: pointer;
  user-select: none;
  border: none;
  border-bottom: 1px solid var(--border-subtle);
  position: sticky;
  top: 0;
  z-index: 3;
}
.rt__layer-header:hover { background: var(--bg-hover); }
.rt__layer-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }
.rt__layer-title { font-size: 12.5px; font-weight: 700; color: var(--text-primary); flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.rt__layer-count { font-size: 11px; color: var(--text-secondary); direction: ltr; font-family: var(--font-mono); }
.rt__layer-chevron { font-size: 10px; color: var(--text-muted); }
.rt__empty-layer {
  padding: 14px 16px;
  font-size: 12px; color: var(--text-muted);
  text-align: center; font-style: italic;
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
/* دستگیره تغییر عرض — مثل اکسل */
.rt__resizer {
  position: absolute;
  inset-inline-end: 0;
  top: 0;
  bottom: 0;
  width: 12px;
  cursor: col-resize;
  touch-action: none;
  z-index: 3;
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
.rt__row--active td:first-child { box-shadow: inset -3px 0 0 var(--brand); }

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
  justify-content: center;
  gap: 12px;
  padding: 10px;
  border-top: 1px solid var(--border-subtle);
  background: var(--bg-panel);
  position: sticky;
  bottom: 0;
  z-index: 2;
  flex-shrink: 0;
}
.rt__page-btn {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  padding: 5px 14px;
  border-radius: var(--radius-sm);
  cursor: pointer;
}
.rt__page-btn:hover:not(:disabled) {
  border-color: var(--brand);
  color: var(--brand);
}
.rt__page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.rt__page-info { font-size: 11.5px; color: var(--text-muted); }
.rt__more-btn {
  width: 100%;
  border: none;
  border-top: 1px solid var(--border-subtle);
  color: var(--brand);
  font-size: 12px;
  font-weight: 600;
  font-family: inherit;
  padding: 8px;
  cursor: pointer;
  position: sticky;
  bottom: 0;
  background: var(--bg-panel);
}
.rt__more-btn:hover { background: var(--bg-panel-raised); }
</style>

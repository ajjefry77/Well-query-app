<template>
  <div class="rt">
    <!-- حالت چند لایه: هر لایه جداگانه -->
    <template v-if="layerGroups.length > 1">
      <div
        v-for="group in layerGroups"
        :key="group.uuid"
        class="rt__layer-group"
      >
        <div class="rt__layer-header" @click="toggleGroup(group.uuid)">
          <span class="rt__layer-dot" :style="{ background: group.color }"></span>
          <span class="rt__layer-title">{{ group.name }}</span>
          <span class="rt__layer-count mono">{{ group.rows.length }} عارضه</span>
          <span class="rt__layer-chevron">{{ collapsedGroups.has(group.uuid) ? '▼' : '▲' }}</span>
        </div>

        <div class="rt__table-wrap" v-show="!collapsedGroups.has(group.uuid)">
          <table class="rt__table" v-if="group.rows.length">
            <thead>
              <tr>
                <th v-for="col in group.columns" :key="col.key">{{ col.label }}</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in groupVisibleRows(group)"
                :key="row.id"
                class="rt__row"
                :class="{ 'rt__row--active': row.id === activeId }"
                @click="$emit('select', row)"
                @mouseenter="$emit('hover', row)"
              >
                <td
                  v-for="col in group.columns"
                  :key="col.key"
                  :class="{ mono: col.mono }"
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
            نمایش {{ Math.min(PAGE_SIZE, group.rows.length - visibleCount(group)) }} رکورد بیشتر ({{ visibleCount(group) }} از {{ group.rows.length }})
          </button>
        </div>
      </div>
    </template>

    <!-- حالت تک‌لایه یا spatial -->
    <template v-else>
      <div class="rt__table-wrap rt__table-wrap--single" v-if="rows.length">
        <table class="rt__table">
          <thead>
            <tr>
              <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in pagedRows"
              :key="row.id"
              class="rt__row"
              :class="{ 'rt__row--active': row.id === activeId }"
              @click="$emit('select', row)"
              @mouseenter="$emit('hover', row)"
            >
              <td
                v-for="col in columns"
                :key="col.key"
                :class="{ mono: col.mono }"
              >
                {{ formatCell(row, col) }}
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="totalPages > 1" class="rt__pager">
          <button class="rt__page-btn" :disabled="page <= 1" @click="prevPage">قبلی</button>
          <span class="rt__page-info mono">{{ page }} / {{ totalPages }}</span>
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

const props = defineProps({
  rows:      { type: Array,  required: true },
  columns:   { type: Array,  required: true },
  activeId:  { type: String, default: null },
  layerMeta: { type: Array,  default: () => [] },
})
defineEmits(['select', 'hover'])

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

const LAYER_COLORS = ['#2a9d8f','#e9c46a','#f4a261','#e76f51','#264653','#a8dadc','#457b9d','#e63946']

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
      color:   meta.color ?? LAYER_COLORS[idx % LAYER_COLORS.length],
      rows:    layerRows,
      columns: layerCols,
    }
  })
})

const collapsedGroups = ref(new Set())
function toggleGroup(uuid) {
  const s = new Set(collapsedGroups.value)
  s.has(uuid) ? s.delete(uuid) : s.add(uuid)
  collapsedGroups.value = s
}

function formatCell(row, col) {
  const val = row[col.key]
  if (col.key === 'distanceKm') return val !== undefined ? val.toFixed(2) : '—'
  if (typeof val === 'boolean') return val ? 'بله' : 'خیر'
  if (val === null || val === undefined) return '—'
  if (typeof val === 'number') return val.toLocaleString('fa-IR')
  return val
}
</script>

<style scoped>
.rt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* بدون overflow — اسکرول از wrapper بیرونی مدیریت میشه */
}

/* ---------- گروه لایه ---------- */
.rt__layer-group {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  overflow: hidden;
  flex-shrink: 0;
}
.rt__layer-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 14px;
  background: var(--bg-panel-raised);
  cursor: pointer;
  user-select: none;
  border-bottom: 1px solid var(--border-subtle);
  transition: background 0.12s;
  position: sticky;
  top: 0;
  z-index: 2;
}
.rt__layer-header:hover { background: var(--bg-input); }
.rt__layer-dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
.rt__layer-title { font-size: 13px; font-weight: 700; color: var(--text-primary); flex: 1; }
.rt__layer-count { font-size: 11px; color: var(--accent-depth); direction: ltr; }
.rt__layer-chevron { font-size: 10px; color: var(--text-muted); }
.rt__empty-layer {
  padding: 14px 16px;
  font-size: 12px; color: var(--text-muted);
  text-align: center; font-style: italic;
}

/* ---------- جدول ---------- */
.rt__table-wrap {
  overflow-x: auto;
  /* بدون overflow-y — اسکرول عمودی از مدال */
}
.rt__table-wrap--single {
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
}
.rt__table {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}
.rt__table thead {
  position: sticky;
  top: 0;
  background: var(--bg-panel-raised);
  z-index: 1;
}
.rt__table th {
  text-align: right;
  padding: 10px 14px;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 11.5px;
  border-bottom: 1px solid var(--border-strong);
  white-space: nowrap;
}
.rt__table td {
  padding: 9px 14px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  white-space: nowrap;
}
.rt__row {
  cursor: pointer;
  transition: background 0.12s var(--ease-out);
}
.rt__row:hover { background: var(--bg-hover); }
.rt__row--active { background: color-mix(in srgb, var(--accent-copper) 12%, transparent); }
.rt__row--active td:first-child { box-shadow: inset 3px 0 0 var(--accent-copper); }

.rt__empty {
  padding: 40px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  line-height: 1.8;
}
.rt__pager {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 10px;
  border-top: 1px solid var(--border-subtle);
}
.rt__page-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 12px;
  font-family: inherit;
  padding: 6px 16px;
  border-radius: var(--radius-full);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.rt__page-btn:hover:not(:disabled) {
  border-color: var(--accent-depth);
  color: var(--accent-depth);
}
.rt__page-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.rt__page-info { font-size: 11.5px; color: var(--text-muted); }
.rt__more-btn {
  width: 100%;
  background: transparent;
  border: none;
  border-top: 1px solid var(--border-subtle);
  color: var(--accent-depth);
  font-size: 12px;
  font-family: inherit;
  padding: 9px;
  cursor: pointer;
  transition: background 0.12s;
}
.rt__more-btn:hover { background: var(--bg-input); }
</style>
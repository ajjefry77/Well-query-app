<template>
  <div class="rt">
    <div class="rt__header">
      <h3>
        نتایج <span class="mono">({{ rows.length }})</span>
      </h3>
      <div class="rt__exports">
        <button
          class="export-btn"
          @click="$emit('export', 'geojson')"
          title="خروجی GeoJSON"
        >
          GeoJSON
        </button>
        <button
          class="export-btn"
          @click="$emit('export', 'csv')"
          title="خروجی CSV"
        >
          CSV
        </button>
        <button class="export-btn" @click="$emit('export', 'kml')">KML</button>
        <button class="export-btn" @click="$emit('export', 'kmz')">KMZ</button>
        <button class="export-btn" @click="$emit('export', 'shp')">SHP</button>
        <button class="export-btn" @click="$emit('export', 'dxf')">DXF</button>
      </div>
    </div>

    <div class="rt__table-wrap" v-if="rows.length">
      <table class="rt__table">
        <thead>
          <tr>
            <th v-for="col in columns" :key="col.key">{{ col.label }}</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="row in rows"
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
    </div>

    <div v-else class="rt__empty">
      نتیجه‌ای با شرایط فعلی یافت نشد. شرط‌ها یا شعاع جستجو را تغییر دهید.
    </div>
  </div>
</template>

<script setup>
const props = defineProps({
  rows: { type: Array, required: true },
  columns: { type: Array, required: true },
  activeId: { type: String, default: null },
});
defineEmits(["select", "hover", "export"]);

function formatCell(row, col) {
  const val = row[col.key];
  if (col.key === "distanceKm") return val !== undefined ? val.toFixed(2) : "—";
  if (typeof val === "boolean") return val ? "بله" : "خیر";
  if (val === null || val === undefined) return "—";
  if (typeof val === "number") return val.toLocaleString("fa-IR");
  return val;
}
</script>

<style scoped>
.rt {
  display: flex;
  flex-direction: column;
  gap: 10px;
  height: 100%;
  min-height: 0;
}
.rt__header {
  display: flex;
  flex-direction: column;   /* عوض شد */
  gap: 8px;
  flex-shrink: 0;
}
.rt__header h3 {
  margin: 0;
  font-size: 14px;
  font-weight: 700;
}
.rt__header h3 .mono {
  color: var(--accent-depth);
  font-size: 12px;
}
.rt__exports {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;          /* اضافه شد */
}
.export-btn {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 11px;
  font-family: var(--font-mono);
  padding: 5px 10px;
  border-radius: var(--radius-sm);
}
.export-btn:hover {
  border-color: var(--accent-copper);
  color: var(--accent-copper-bright);
}

.rt__table-wrap {
  overflow: auto;
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  flex: 1;
  min-height: 0;
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
  padding: 10px 12px;
  font-weight: 600;
  color: var(--text-secondary);
  font-size: 11.5px;
  border-bottom: 1px solid var(--border-strong);
  white-space: nowrap;
}
.rt__table td {
  padding: 9px 12px;
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-primary);
  white-space: nowrap;
}
.rt__row {
  cursor: pointer;
  transition: background 0.1s ease;
}
.rt__row:hover {
  background: var(--bg-panel-raised);
}
.rt__row--active {
  background: rgba(201, 122, 74, 0.12);
}
.rt__row--active td:first-child {
  box-shadow: inset 3px 0 0 var(--accent-copper);
}

.rt__empty {
  padding: 32px 16px;
  text-align: center;
  color: var(--text-muted);
  font-size: 13px;
  border: 1px dashed var(--border-subtle);
  border-radius: var(--radius-md);
  line-height: 1.8;
}
</style>

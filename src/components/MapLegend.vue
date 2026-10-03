<template>
  <div v-if="entries.length" class="map-legend" :class="{ collapsed }">
    <button class="legend-head" @click="collapsed = !collapsed">
      <span class="legend-title">راهنما</span>
      <span class="legend-chev">{{ collapsed ? '▴' : '▾' }}</span>
    </button>
    <div v-show="!collapsed" class="legend-body">
      <div v-for="e in entries" :key="e.uuid" class="legend-layer">
        <div class="legend-layer-name">{{ e.name }}</div>
        <div v-for="(it, i) in e.items.slice(0, 12)" :key="i" class="legend-row">
          <span v-if="it.gradient" class="lg-grad" :style="{ background: `linear-gradient(to left, ${it.gradient.join(',')})` }"></span>
          <span v-else class="lg-sw" :style="sw(it, e.geomKind)"></span>
          <span class="lg-lbl">{{ it.label }}</span>
        </div>
        <div v-if="e.items.length > 12" class="lg-more">+{{ (e.items.length - 12).toLocaleString('fa-IR') }} مورد دیگر…</div>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref } from 'vue'
const props = defineProps({ entries: { type: Array, default: () => [] } })
const collapsed = ref(false)
function sw(it, geomKind) {
  if (geomKind === 'line') {
    return { background: 'transparent', borderTop: `4px solid ${it.color ?? '#888'}`, width: '24px', height: '0', borderRadius: '0' }
  }
  const s = Math.max(8, Math.min(18, it.size ?? 12))
  return { background: it.color ?? '#888', width: s + 'px', height: s + 'px', opacity: geomKind === 'polygon' ? 0.8 : 1 }
}
</script>
<style scoped>
.map-legend { position: absolute; bottom: 48px; inset-inline-start: 12px; z-index: 500; background: var(--bg-panel); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: var(--shadow-md); min-width: 170px; max-width: 250px; max-height: 46%; display: flex; flex-direction: column; overflow: hidden; font-size: 12px; }
.legend-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; background: var(--bg-panel-raised); border: none; border-bottom: 1px solid var(--border-subtle); color: var(--text-primary); font-family: inherit; font-size: 12px; font-weight: 800; padding: 7px 12px; cursor: pointer; }
.legend-chev { color: var(--text-muted); }
.legend-body { overflow-y: auto; padding: 8px 10px; display: flex; flex-direction: column; gap: 10px; }
.legend-layer-name { font-size: 11.5px; font-weight: 800; color: var(--text-primary); margin-bottom: 4px; }
.legend-row { display: flex; align-items: center; gap: 7px; padding: 1px 0; }
.lg-sw { border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.25); }
.lg-grad { width: 70px; height: 12px; border-radius: 6px; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.2); }
.lg-lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-secondary); font-size: 11.5px; }
.lg-more { font-size: 10.5px; color: var(--text-muted); font-style: italic; }
</style>

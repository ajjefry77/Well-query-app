<template>
  <div class="se">
    <div class="se-prev" :style="prevStyle" :title="geomKindLabel"></div>
    <div class="se-grid">
      <div class="se-item">
        <label>{{ geomKind === 'line' ? 'رنگ خط' : geomKind === 'polygon' ? 'رنگ داخل' : 'رنگ نماد' }}</label>

        <input type="color" :value="local.color" @input="set('color', $event.target.value)" />
        <span class="hex mono" dir="ltr">{{ local.color }}</span>
      </div>
      <div class="se-item">
        <label>{{ geomKind === 'point' ? 'رنگ حاشیه' : 'رنگ خط مرزی' }}</label>
        <input type="color" :value="local.strokeColor" @input="set('strokeColor', $event.target.value)" />
        <span class="hex mono" dir="ltr">{{ local.strokeColor }}</span>
      </div>
      <div class="se-item">
        <label>{{ geomKind === 'point' ? 'اندازه (px)' : geomKind === 'line' ? 'ضخامت خط' : 'ضخامت مرز' }}: {{ local[geomKind === 'point' ? 'size' : 'strokeWidth'] }}</label>
        <input type="range" :min="geomKind === 'point' ? 3 : 0.5" :max="geomKind === 'point' ? 30 : 10" step="0.5"
          :value="geomKind === 'point' ? local.size : local.strokeWidth"
          @input="set(geomKind === 'point' ? 'size' : 'strokeWidth', Number($event.target.value))" />
      </div>
      <div v-if="geomKind === 'polygon'" class="se-item">
        <label>شفافیت داخل: {{ Math.round((local.fillOpacity ?? 0.55) * 100) }}٪</label>
        <input type="range" min="0" max="1" step="0.05" :value="local.fillOpacity ?? 0.55" @input="set('fillOpacity', Number($event.target.value))" />
      </div>
      <div v-if="geomKind === 'point'" class="se-item">
        <label>شکل نشانگر</label>
        <select :value="local.shape" @change="set('shape', $event.target.value)" class="se-select">
          <option value="circle">● دایره</option>
          <option value="square">■ مربع</option>
          <option value="triangle">▲ مثلث</option>
          <option value="diamond">◆ لوزی</option>
          <option value="cross">✕ ضربدر</option>
          <option value="star">★ ستاره</option>
        </select>
      </div>
      <div v-if="geomKind === 'line'" class="se-item">
        <label>سبک خط</label>
        <select :value="local.dash" @change="set('dash', $event.target.value)" class="se-select">
          <option value="solid">— پیوسته</option>
          <option value="dash">┄ چین‌دار</option>
          <option value="dot">… نقطه‌ای</option>
        </select>
      </div>
    </div>
  </div>
</template>
<script setup>
import { ref, watch, computed } from 'vue'
const props = defineProps({ modelValue: { type: Object, required: true }, geomKind: { type: String, default: 'point' } })
const emit = defineEmits(['update'])
const local = ref({ ...props.modelValue })
watch(() => props.modelValue, (v) => { local.value = { ...v } }, { deep: true })
function set(k, v) { local.value[k] = v; emit('update', { ...local.value }) }
const geomKindLabel = computed(() => props.geomKind === 'polygon' ? 'پلیگان' : props.geomKind === 'line' ? 'خط' : 'نقطه')
const prevStyle = computed(() => {
  const c = local.value.color ?? '#0f5c7e'
  const s = local.value.strokeColor ?? '#fff'
  if (props.geomKind === 'line') {
    const w = Math.max(2, Math.min(10, local.value.strokeWidth ?? 2.5))
    return { background: 'transparent', borderTop: `${w}px ${props.modelValue?.dash === 'dash' ? 'dashed' : props.modelValue?.dash === 'dot' ? 'dotted' : 'solid'} ${c}`, height: '0', borderRadius: '0', width: '120px' }
  }
  if (props.geomKind === 'polygon') {
    return { background: c, opacity: local.value.fillOpacity ?? 0.55, border: `2px solid ${s}`, width: '72px', height: '48px', borderRadius: '8px' }
  }
  const sz = Math.max(14, Math.min(44, (local.value.size ?? 7) * 2.4))
  const shapes = { circle: '50%', square: '6px', diamond: '6px', triangle: '6px', cross: '50%', star: '50%' }
  return {
    background: c, border: `2px solid ${s}`, width: sz + 'px', height: sz + 'px',
    borderRadius: shapes[local.value.shape] ?? '50%',
    transform: local.value.shape === 'diamond' ? 'rotate(45deg)' : 'none',
  }
})
</script>
<style scoped>
.se { display: flex; gap: 14px; align-items: flex-start; }
.se-prev { flex-shrink: 0; margin-top: 4px; box-shadow: 0 1px 5px rgba(0,0,0,0.25); }
.se-grid { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 10px 14px; }
.se-item { display: flex; flex-direction: column; gap: 5px; font-size: 11.5px; color: var(--text-secondary); font-weight: 600; }
.se-item input[type="color"] { width: 44px; height: 26px; border: none; background: none; cursor: pointer; padding: 0; }
.se-item input[type="range"] { width: 100%; }
.hex { font-size: 10.5px; color: var(--text-muted); }
.se-select { background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 8px; color: var(--text-primary); font-family: inherit; font-size: 12px; padding: 6px 8px; }
@media (max-width: 600px) { .se { flex-direction: column; } .se-grid { grid-template-columns: 1fr; width: 100%; } }
</style>

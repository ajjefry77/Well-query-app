<template>
  <aside class="analysis-panel" dir="rtl">
    <h2>نقشه‌های هم‌مقدار</h2>
    <p class="note">از مقادیر نقاط، سطح پیوسته و منحنی‌های هم‌مقدار بسازید. محاسبه در مرورگر انجام می‌شود.</p>
    <form @submit.prevent="generate">
      <label>لایه نقطه‌ای
        <select v-model="layerUuid" :disabled="busy"><option value="">انتخاب لایه</option><option v-for="layer in pointLayers" :key="layer.uuid" :value="String(layer.uuid)">{{ layer.display_name || layer.name }}</option></select>
      </label>
      <p v-if="!pointLayers.length" class="note">از «مدیریت لایه‌ها» یک لایه نقطه‌ای اضافه کنید.</p>
      <label>فیلد عددی
        <select v-model="field" :disabled="busy || !layerUuid"><option value="">انتخاب فیلد</option><option v-for="f in numericFields" :key="f.key" :value="f.key">{{ f.label || f.name || f.key }}</option></select>
      </label>
      <label>نوع نقشه
        <select v-model="kind" :disabled="busy"><option v-for="item in kinds" :key="item[0]" :value="item[0]">{{ item[1] }}</option></select>
      </label>
      <label>واحد مقدار <input v-model="unit" maxlength="30" placeholder="مثلاً متر، bar یا °C" :disabled="busy" /></label>
      <p class="note">نوع نقشه عنوان را تعیین می‌کند؛ فیلد و واحد باید با پارامتر مورد نظر مطابقت داشته باشند. تبدیل عمق یا واحد خودکار نیست.</p>
      <label>روش درون‌یابی <select disabled><option>IDW — وزن‌دهی معکوس فاصله</option></select></label>
      <div class="two-columns">
        <label>فاصله خطوط <input v-model.number="interval" type="number" min="0.000001" step="any" required :disabled="busy" /></label>
        <label>توان فاصله <input v-model.number="power" type="number" min="1" max="4" step="0.5" required :disabled="busy" /></label>
        <label>همسایه‌ها <input v-model.number="neighbors" type="number" min="3" max="32" step="1" required :disabled="busy" /></label>
        <label>شبکه <select v-model.number="resolution" :disabled="busy"><option :value="48">۴۸ × ۴۸</option><option :value="80">۸۰ × ۸۰</option><option :value="128">۱۲۸ × ۱۲۸</option><option :value="160">۱۶۰ × ۱۶۰</option></select></label>
      </div>
      <label>طیف رنگ <select v-model="ramp" :disabled="busy"><option v-for="r in ramps" :key="r.id" :value="r.id">{{ r.name }}</option></select></label>
      <button class="primary" type="submit" :disabled="busy || !field || !layerUuid">ساخت نقشه هم‌مقدار</button>
      <div v-if="busy" role="status"><progress :value="progress" max="100"></progress> {{ progress }}٪ <button type="button" @click="cancel">لغو محاسبه</button></div>
      <p v-if="error" role="alert" class="error">{{ error }}</p>
    </form>
    <section v-if="modelValue" class="output">
      <h3>{{ modelValue.title }}</h3>
      <p>{{ modelValue.field }} · {{ modelValue.count.toLocaleString('fa-IR') }} نقطه · IDW</p>
      <p>بازه: {{ format(modelValue.min) }} تا {{ format(modelValue.max) }} {{ modelValue.unit }}</p>
      <p v-if="modelValue.excluded">{{ modelValue.excluded.toLocaleString('fa-IR') }} ردیف بدون مقدار یا هندسه نقطه‌ای معتبر کنار گذاشته شد.</p>
      <p v-if="modelValue.duplicates">مقدار نقاط هم‌مکان میانگین گرفته شد ({{ modelValue.duplicates }} ردیف تکراری).</p>
      <p v-if="!modelValue.lines.features.length" class="note">ترازی در بازه داده‌ها با این فاصله وجود ندارد؛ سطح رنگی ساخته شد. فاصله خطوط را کاهش دهید.</p>
      <label class="check"><input type="checkbox" :checked="modelValue.visible" @change="update('visible', $event.target.checked)" /> نمایش نقشه</label>
      <label class="check"><input type="checkbox" :checked="modelValue.surface" @change="update('surface', $event.target.checked)" /> سطح رنگی</label>
      <label class="check"><input type="checkbox" :checked="modelValue.labels" @change="update('labels', $event.target.checked)" /> برچسب خطوط</label>
      <label>رنگ خطوط <input type="color" :value="modelValue.lineColor" @input="update('lineColor', $event.target.value)" /></label>
      <label>شفافیت سطح <input type="range" min="0" max="1" step="0.05" :value="modelValue.opacity" @input="update('opacity', Number($event.target.value))" /></label>
      <button @click="$emit('zoom', modelValue.coordinates)">نمایش محدوده</button>
      <button :disabled="!modelValue.lines.features.length" @click="download">خروجی خطوط GeoJSON</button>
      <button :disabled="busy" @click="$emit('update:modelValue', null)">حذف نقشه ساخته‌شده</button>
    </section>
    <p class="note">سطح و خطوط به پوش محدب نقاط محدود می‌شوند. فاصله‌ها در صفحه وب‌مرکاتور و برای گستره‌های محلی محاسبه می‌شوند. از تمام نقاط معتبر لایه استفاده می‌شود؛ فیلتر کوئری داده ورودی را تغییر نمی‌دهد. دقت وابسته به کیفیت و پراکندگی نقاط است. Kriging و Topo to Raster در این نسخه پشتیبانی نمی‌شوند.</p>
  </aside>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'
import { COLOR_RAMPS, sampleRamp } from '../composables/useSymbology.js'
import { numericValue } from '../utils/contours.js'
const props = defineProps({ layers: { type: Array, default: () => [] }, rowsMap: { type: Object, default: () => ({}) }, fieldsMap: { type: Object, default: () => ({}) }, modelValue: { type: Object, default: null } })
const emit = defineEmits(['update:modelValue', 'zoom'])
const layerUuid = ref(''), field = ref(''), kind = ref('isobath'), unit = ref(''), interval = ref(50), power = ref(2), neighbors = ref(12), resolution = ref(80), ramp = ref('viridis')
const busy = ref(false), progress = ref(0), error = ref('')
const kinds = [['isobath', 'هم‌ژرفا (Isobath)'], ['isochore', 'هم‌ضخامت عمودی (Isochore)'], ['isotransmissibility', 'هم‌تراوایی'], ['isobar', 'هم‌فشار (Isobar)'], ['isotherm', 'هم‌دما (Isotherm)'], ['isochrone', 'هم‌زمان لرزه‌ای (Isochrone)'], ['isohypse', 'هم‌تراز ساختاری (Isohypse)']]
const ramps = COLOR_RAMPS.filter(r => r.kind === 'sequential' || r.kind === 'diverging')
const pointLayers = computed(() => props.layers.filter(l => props.rowsMap[l.uuid]?.some(r => r._geometry?.type === 'Point')))
const rows = computed(() => props.rowsMap[layerUuid.value] || [])
const numericFields = computed(() => (props.fieldsMap[layerUuid.value] || []).filter(f => f.key && rows.value.some(r => Number.isFinite(numericValue(r[f.key])))))
let worker = null, revision = 0
function cancel() { revision++; worker?.terminate(); worker = null; busy.value = false }
watch(layerUuid, () => { cancel(); field.value = ''; error.value = '' })
watch(rows, cancel)
watch(pointLayers, layers => { if (layerUuid.value && !layers.some(l => String(l.uuid) === layerUuid.value)) layerUuid.value = '' })
onBeforeUnmount(cancel)
const format = v => Number(v.toPrecision(7)).toLocaleString('fa-IR')
function update(key, value) { emit('update:modelValue', { ...props.modelValue, [key]: value }) }
function generate() {
  cancel(); error.value = ''; progress.value = 0
  if (!rows.value.length || !field.value) return
  const current = revision
  const selected = props.layers.find(l => String(l.uuid) === layerUuid.value)
  const metadata = { layerUuid: layerUuid.value, sourceRows: rows.value, title: kinds.find(k => k[0] === kind.value)[1], unit: unit.value, layerName: selected?.display_name || selected?.name }
  busy.value = true
  try {
    worker = new Worker(new URL('../workers/contours.worker.js', import.meta.url), { type: 'module' })
    worker.onmessage = ({ data }) => {
      if (current !== revision) return
      if ('progress' in data) progress.value = data.progress
      if (data.error) { error.value = data.error; cancel() }
      if (data.result) {
        try {
          const result = data.result, colors = sampleRamp(ramp.value, 256)
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = result.resolution
          const context = canvas.getContext('2d'), pixels = context.createImageData(canvas.width, canvas.height)
          for (let i = 0; i < result.values.length; i++) {
            if (!result.mask[i]) continue
            const t = result.max === result.min ? 0.5 : (result.values[i] - result.min) / (result.max - result.min)
            const hex = colors[Math.max(0, Math.min(255, Math.round(t * 255)))].slice(1)
            const rgb = parseInt(hex, 16)
            pixels.data.set([rgb >> 16 & 255, rgb >> 8 & 255, rgb & 255, 255], i * 4)
          }
          context.putImageData(pixels, 0, 0)
          const { values, mask, ...output } = result
          emit('update:modelValue', { ...output, ...metadata, image: canvas.toDataURL('image/png'), colors: [colors[0], colors[128], colors[255]], visible: true, labels: true, surface: true, opacity: 0.65, lineColor: '#243c64' })
          emit('zoom', result.coordinates)
        } catch { error.value = 'نمایش سطح ساخته‌شده ممکن نشد؛ دوباره تلاش کنید.' }
        cancel()
      }
    }
    worker.onerror = () => { if (current === revision) { error.value = 'محاسبه نقشه انجام نشد؛ دوباره تلاش کنید.'; cancel() } }
    // Only the selected numeric attribute and actual point geometry enter the worker.
    worker.postMessage({ rows: rows.value.map(r => ({ [field.value]: r[field.value], _geometry: r._geometry ? { type: r._geometry.type, coordinates: r._geometry.type === 'Point' ? [...r._geometry.coordinates] : [] } : null })), options: { field: field.value, interval: interval.value, power: power.value, neighbors: neighbors.value, resolution: resolution.value } })
  } catch { error.value = 'شروع محاسبه ممکن نشد؛ مرورگر باید Web Worker را پشتیبانی کند.'; cancel() }
}
function download() {
  const value = props.modelValue
  const data = { ...value.lines, metadata: { title: value.title, layer: value.layerName, field: value.field, unit: value.unit, method: 'IDW', interval: value.interval, power: value.power, neighbors: value.neighbors, resolution: value.resolution, samples: value.count, clipping: 'convex hull', distanceProjection: 'EPSG:3857', coordinates: 'WGS84' } }
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/geo+json' })), a = document.createElement('a')
  a.href = url; a.download = `contours-${value.field.replace(/[^\w\u0600-\u06ff-]/g, '_')}.geojson`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000)
}
</script>

<style scoped>
.analysis-panel { width: 310px; min-width: 250px; flex-shrink: 0; overflow-y: auto; padding: 18px; background: var(--bg-panel); color: var(--text-primary); border-inline-end: 1px solid var(--border-subtle); }
h2 { font-size: 16px; margin: 0 0 12px; } h3 { font-size: 14px; }
form, .output { display: flex; flex-direction: column; gap: 12px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; }
select, input:not([type=checkbox]), button { max-width: 100%; min-width: 0; padding: 8px; background: var(--bg-input, var(--bg-panel)); color: var(--text-primary); border: 1px solid var(--border-subtle); border-radius: 7px; font: inherit; }
button { cursor: pointer; } button:disabled { opacity: .5; cursor: default; } .primary { background: var(--brand); color: white; }
.two-columns { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.note, .output p { font-size: 11px; line-height: 1.9; color: var(--text-muted); margin: 4px 0 12px; }
.error { color: var(--accent-danger, #dc2626); font-size: 12px; } .check { flex-direction: row; align-items: center; }
.output { margin-top: 18px; padding-top: 12px; border-top: 1px solid var(--border-subtle); } progress { width: 100%; }
@media(max-width:760px) { .analysis-panel { position: absolute; bottom: 0; inset-inline: 0; width: auto; height: var(--sheet-h, 42vh); max-height: none; padding: 64px 18px 18px; z-index: 30; border-top: 1px solid var(--border-subtle); } }
</style>

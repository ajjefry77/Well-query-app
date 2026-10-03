<template>
  <div class="sym-overlay" @click.self="$emit('close')">
    <div class="sym-modal" role="dialog" aria-modal="true" aria-label="سیمبولوژی لایه">
      <!-- هدر -->
      <div class="sym-header">
        <div class="sym-title-wrap">
          <div>
            <div class="sym-title">سیمبولوژی — {{ layerName }}</div>
            <div class="sym-sub">
              <span class="sym-geom" :class="'sym-geom--' + geomKind">{{ geomLabel }}</span>
              <span class="sym-count">{{ rows.length.toLocaleString('fa-IR') }} عارضه</span>
            </div>
          </div>
        </div>
        <button class="sym-close" @click="$emit('close')" title="بستن">×</button>
      </div>

      <div class="sym-body">
        <!-- ستون روش (مثل ArcGIS: لیست Symbology pane) -->
        <div class="sym-methods">
          <div class="sym-sec">روش نمایش</div>
          <button
            v-for="r in availableRenderers"
            :key="r.id"
            class="sym-method"
            :class="{ active: local.renderer === r.id }"
            @click="setRenderer(r.id)"
            :title="r.desc"
          >
            <span class="sym-method-dot" :style="methodDot(r.id)"></span>
            <span class="sym-method-name">{{ r.name }}</span>
          </button>
          <div class="sym-sec" style="margin-top:10px">شفافیت کلی</div>
          <div class="sym-row">
            <input type="range" min="0" max="90" step="1" v-model.number="local.transparency" @input="emitUpdate" />
            <span class="mono">{{ local.transparency }}٪</span>
          </div>
        </div>

        <!-- ستون تنظیمات -->
        <div class="sym-settings">
          <!-- انتخاب فیلد -->
          <div v-if="needsField" class="sym-card">
            <div class="sym-card-title">فیلد مقدار</div>
            <div class="sym-row">
              <select v-model="local.field" @change="onFieldChange" class="sym-select">
                <option :value="null">— انتخاب فیلد —</option>
                <option v-for="f in fieldOptions" :key="f.key" :value="f.key">
                  {{ f.label }} ({{ f.type === 'number' ? 'عددی' : 'متنی' }})
                </option>
              </select>
            </div>
            <div v-if="isNumericRenderer" class="sym-row" style="margin-top:8px">
              <label class="sym-lbl">نرمال‌سازی (اختیاری)</label>
              <select v-model="local.normField" @change="emitUpdate" class="sym-select">
                <option :value="null">بدون نرمال‌سازی</option>
                <option v-for="f in numericFields" :key="f.key" :value="f.key">{{ f.label }}</option>
              </select>
            </div>
            <div v-if="needsField && local.field && wrongType" class="sym-warn">
              ⚠ فیلد انتخابی {{ rendererDef?.fieldType === 'number' ? 'باید عددی' : '' }} باشد. یک فیلد مناسب انتخاب کنید.
            </div>
          </div>

          <!-- ===== تک‌نماد ===== -->
          <div v-if="local.renderer === 'single'" class="sym-card">
            <div class="sym-card-title">نماد واحد</div>
            <SymbolEditor :model-value="local.single" :geom-kind="geomKind" @update="local.single = $event; emitUpdate()" />
          </div>

          <!-- ===== مقادیر یکتا ===== -->
          <div v-if="local.renderer === 'unique'" class="sym-card">
            <div class="sym-card-title">مقادیر یکتا</div>
            <div class="sym-row">
              <label class="sym-lbl">رامپ رنگ</label>
              <RampPicker v-model="local.colorRamp" @change="recolorUnique(true, $event)" />
              <label class="chk"><input type="checkbox" v-model="local.reversed" @change="recolorUnique(true)" /> معکوس</label>
            </div>
            <div class="sym-row" style="margin-top:8px">
              <button class="btn" @click="addAllValues">➕ افزودن همه مقادیر ({{ distinctCount }})</button>
              <button class="btn btn-ghost" @click="clearUnique">پاک کردن</button>
              <label class="sym-lbl">سقف: {{ local.uniqueLimit }}</label>
              <input type="range" min="5" max="100" step="5" v-model.number="local.uniqueLimit" @change="addAllValues" style="width:90px" />
            </div>
            <div class="sym-row" style="margin-top:8px">
              <input v-model="uniqueSearch" placeholder="جستجوی مقدار…" class="sym-input" />
              <label class="chk"><input type="checkbox" v-model="local.showOther" @change="emitUpdate" /> نمایش سایر مقادیر</label>
              <input v-if="local.showOther" type="color" v-model="local.otherColor" @input="emitUpdate" title="رنگ سایر" />
            </div>
            <div class="sym-classes">
              <div v-for="(u, i) in filteredUnique" :key="u.value + i" class="sym-class-row">
                <input type="color" v-model="u.color" @input="emitUpdate" />
                <span class="sym-class-lbl" :title="u.value">{{ u.label }}</span>
                <span class="sym-class-count mono">{{ (u.count ?? 0).toLocaleString('fa-IR') }}</span>
                <button class="mini-x" @click="removeUnique(i)" title="حذف">×</button>
              </div>
              <div v-if="!local.uniqueValues.length" class="sym-empty">هنوز مقداری اضافه نشده — «افزودن همه مقادیر» را بزنید.</div>
            </div>
          </div>

          <!-- ===== رنگ مدرج / نماد مدرج / پیوسته ===== -->
          <div v-if="['graduated','graduated-sym','unclassed'].includes(local.renderer)" class="sym-card">
            <div class="sym-card-title">{{ local.renderer === 'graduated-sym' ? 'نمادهای مدرج' : local.renderer === 'unclassed' ? 'رنگ پیوسته' : 'رنگ‌های مدرج' }}</div>
            <div class="sym-grid2">
              <div>
                <label class="sym-lbl">روش طبقه‌بندی</label>
                <select v-model="local.method" @change="reclassify" class="sym-select">
                  <option v-for="m in CLASS_METHODS" :key="m.id" :value="m.id">{{ m.name }}</option>
                </select>
              </div>
              <div v-if="local.renderer !== 'unclassed'">
                <label class="sym-lbl">تعداد کلاس: {{ local.numClasses }}</label>
                <input type="range" min="2" max="9" step="1" v-model.number="local.numClasses" @change="reclassify" />
              </div>
            </div>
            <div class="sym-row" style="margin-top:8px">
              <label class="sym-lbl">رامپ رنگ</label>
              <RampPicker v-model="local.colorRamp" :categorical="false" @change="reclassify($event)" />
              <label class="chk"><input type="checkbox" v-model="local.reversed" @change="reclassify" /> معکوس</label>
            </div>
            <div v-if="local.renderer === 'graduated-sym'" class="sym-grid2" style="margin-top:8px">
              <div><label class="sym-lbl">حداقل اندازه: {{ local.gradSym.minSize }}px</label>
                <input type="range" min="2" max="30" v-model.number="local.gradSym.minSize" @input="reclassify" /></div>
              <div><label class="sym-lbl">حداکثر اندازه: {{ local.gradSym.maxSize }}px</label>
                <input type="range" min="4" max="48" v-model.number="local.gradSym.maxSize" @input="reclassify" /></div>
              <div><label class="sym-lbl">رنگ نماد</label><input type="color" v-model="local.gradSym.color" @input="emitUpdate" /></div>
            </div>
            <!-- هیستوگرام ساده شمارش کلاس‌ها -->
            <div class="sym-hist">
              <div v-for="(c, i) in local.classes" :key="i" class="sym-hist-col" :title="`${c.label}: ${c.count}`">
                <div class="sym-hist-bar" :style="{ height: histH(c.count), background: local.renderer === 'graduated-sym' ? local.gradSym.color : c.color }"></div>
              </div>
            </div>
            <div class="sym-classes">
              <div v-for="(c, i) in local.classes" :key="i" class="sym-class-row">
                <input type="color" v-model="c.color" @input="emitUpdate" />
                <span v-if="local.renderer === 'graduated-sym'" class="sym-dot" :style="{ width: c.size + 'px', height: c.size + 'px', background: local.gradSym.color }"></span>
                <span class="sym-class-lbl mono" dir="ltr">{{ c.label }}</span>
                <span class="sym-class-count mono">{{ (c.count ?? 0).toLocaleString('fa-IR') }}</span>
                <template v-if="local.method === 'manual'">
                  <input class="sym-num mono" dir="ltr" type="number" step="any" v-model.number="c.min" @change="manualEdited" title="کف بازه" />
                  <input class="sym-num mono" dir="ltr" type="number" step="any" v-model.number="c.max" @change="manualEdited" title="سقف بازه" />
                </template>
              </div>
              <div v-if="!local.classes.length" class="sym-empty">فیلد عددی انتخاب کنید تا کلاس‌ها ساخته شوند.</div>
            </div>
          </div>

          <!-- ===== متناسب ===== -->
          <div v-if="local.renderer === 'proportional'" class="sym-card">
            <div class="sym-card-title">نماد متناسب (پیوسته)</div>
            <div class="sym-grid2">
              <div><label class="sym-lbl">حداقل اندازه: {{ local.prop.minSize }}px</label>
                <input type="range" min="2" max="30" v-model.number="local.prop.minSize" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">حداکثر اندازه: {{ local.prop.maxSize }}px</label>
                <input type="range" min="6" max="60" v-model.number="local.prop.maxSize" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">رنگ</label><input type="color" v-model="local.prop.color" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">رنگ حاشیه</label><input type="color" v-model="local.prop.strokeColor" @input="emitUpdate" /></div>
            </div>
            <div class="sym-note">اندازه نماد با جذر مقدار (مقیاس مساحتی مثل ArcGIS) تغییر می‌کند. بازه داده: <span class="mono" dir="ltr">{{ dataMin }} – {{ dataMax }}</span></div>
          </div>

          <!-- ===== هیت‌مپ ===== -->
          <div v-if="local.renderer === 'heatmap'" class="sym-card">
            <div class="sym-card-title">نقشه حرارتی (فقط نقطه‌ای)</div>
            <div class="sym-grid2">
              <div><label class="sym-lbl">شعاع: {{ local.heat.radius }}px</label>
                <input type="range" min="5" max="100" v-model.number="local.heat.radius" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">شدت: {{ local.heat.intensity }}</label>
                <input type="range" min="0.1" max="2" step="0.1" v-model.number="local.heat.intensity" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">شفافیت لایه: {{ local.heat.opacity }}</label>
                <input type="range" min="0.1" max="1" step="0.05" v-model.number="local.heat.opacity" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">گرادیان رنگ</label>
                <RampPicker v-model="local.heat.ramp" :categorical="false" @change="emitUpdate" /></div>
            </div>
            <div class="sym-heat-prev" :style="{ background: heatPreview }"></div>
          </div>

          <!-- ===== دات دنسیتی ===== -->
          <div v-if="local.renderer === 'dot'" class="sym-card">
            <div class="sym-card-title">تراکم نقطه‌ای (فقط پلیگانی)</div>
            <div class="sym-row" style="margin-bottom:8px">
              <label class="sym-lbl">فیلد مقدار (اختیاری — بدون فیلد: ۱ نقطه برای هر عارضه)</label>
              <select v-model="local.field" @change="emitUpdate" class="sym-select">
                <option :value="null">— بدون فیلد —</option>
                <option v-for="f in numericFields" :key="f.key" :value="f.key">{{ f.label }}</option>
              </select>
            </div>
            <div class="sym-grid2">
              <div><label class="sym-lbl">مقدار هر نقطه</label>
                <input class="sym-input mono" dir="ltr" type="number" min="0.001" step="any" v-model.number="local.dot.value" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">اندازه نقطه: {{ local.dot.size }}px</label>
                <input type="range" min="1" max="10" step="0.5" v-model.number="local.dot.size" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">رنگ نقطه</label><input type="color" v-model="local.dot.color" @input="emitUpdate" /></div>
              <div><label class="sym-lbl">کدورت: {{ local.dot.opacity }}</label>
                <input type="range" min="0.1" max="1" step="0.05" v-model.number="local.dot.opacity" @input="emitUpdate" /></div>
            </div>
            <div class="sym-note">تعداد نقاط هر پلیگان = مقدار فیلد ÷ «مقدار هر نقطه» (پیش‌فرض: ۱ نقطه برای هر عارضه). نقاط به‌صورت تصادفی داخل پلیگان پخش می‌شوند.</div>
          </div>
        </div>

        <!-- ستون پیش‌نمایش / لجند -->
        <div class="sym-preview">
          <div class="sym-sec">پیش‌نمایش لجند</div>
          <div class="sym-legend">
            <div v-for="(it, i) in legend" :key="i" class="sym-leg-row">
              <span v-if="it.gradient" class="sym-leg-grad" :style="{ background: `linear-gradient(to left, ${it.gradient.join(',')})` }"></span>
              <span v-else class="sym-leg-swatch" :style="swatch(it)"></span>
              <span class="sym-leg-lbl">{{ it.label }}</span>
              <span v-if="it.count != null" class="sym-leg-count mono">{{ Number(it.count).toLocaleString('fa-IR') }}</span>
            </div>
            <div v-if="!legend.length" class="sym-empty">—</div>
          </div>
          <div class="sym-sec" style="margin-top:10px">پیش‌نمایش نمادها</div>
          <div class="sym-swatch-row">
            <span v-for="(it, i) in legend.slice(0, 9)" :key="'s' + i" class="sym-big-dot" :style="swatch(it, true)"></span>
          </div>
        </div>
      </div>

      <!-- فوتر -->
      <div class="sym-footer">
        <button class="btn btn-ghost" @click="$emit('reset')">↩ بازنشانی</button>
        <span class="sym-hint">تغییرات به‌صورت زنده روی نقشه اعمال می‌شود</span>
        <button class="btn btn-primary" @click="$emit('close')">تأیید و بستن</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, defineAsyncComponent } from 'vue'
import {
  RENDERERS, CLASS_METHODS, COLOR_RAMPS, sampleRamp, classifyBreaks,
  buildGraduatedClasses, buildUniqueValues, numericValues, legendItems,
} from '../composables/useSymbology.js'

const RampPicker = defineAsyncComponent(() => import('./RampPicker.vue'))
const SymbolEditor = defineAsyncComponent(() => import('./SymbolEditor.vue'))

const props = defineProps({
  layer: { type: Object, required: true },
  layerName: { type: String, default: '' },
  geomKind: { type: String, default: 'point' },
  fields: { type: Array, default: () => [] },
  rows: { type: Array, default: () => [] },
  modelValue: { type: Object, required: true },
})
const emit = defineEmits(['update:model-value', 'update', 'reset', 'close'])

const local = ref(JSON.parse(JSON.stringify(props.modelValue)))
watch(() => props.modelValue, (v) => {
  const sig = JSON.stringify(v)
  if (sig !== JSON.stringify(local.value)) local.value = JSON.parse(sig)
})

const uniqueSearch = ref('')
const rendererDef = computed(() => RENDERERS.find(r => r.id === local.value.renderer))
const needsField = computed(() => !!rendererDef.value?.needsField)
const isNumericRenderer = computed(() => ['graduated', 'unclassed', 'graduated-sym', 'proportional'].includes(local.value.renderer))
const availableRenderers = computed(() => RENDERERS.filter(r => {
  if (r.pointsOnly && props.geomKind !== 'point') return false
  if (r.polygonsOnly && props.geomKind !== 'polygon') return false
  return true
}))
const fieldOptions = computed(() => {
  const t = rendererDef.value?.fieldType
  if (t === 'number') return props.fields.filter(f => f.type === 'number')
  return props.fields
})
const numericFields = computed(() => props.fields.filter(f => f.type === 'number'))
const wrongType = computed(() => {
  if (!local.value.field || !rendererDef.value) return false
  if (rendererDef.value.fieldType !== 'number') return false
  return !numericFields.value.some(f => f.key === local.value.field)
})
const distinctCount = computed(() => {
  if (!local.value.field) return 0
  return new Set((props.rows ?? []).map(r => String(r?.[local.value.field] ?? '(خالی)'))).size
})
const filteredUnique = computed(() => {
  const q = uniqueSearch.value.trim().toLowerCase()
  const arr = local.value.uniqueValues || []
  if (!q) return arr
  return arr.filter(u => String(u.label).toLowerCase().includes(q))
})
const dataMin = computed(() => {
  const v = numericValues(props.rows, local.value.field)
  return v.length ? v[0] : '—'
})
const dataMax = computed(() => {
  const v = numericValues(props.rows, local.value.field)
  return v.length ? v[v.length - 1] : '—'
})
const legend = computed(() => legendItems(local.value, props.geomKind))
const geomLabel = computed(() => props.geomKind === 'polygon' ? 'پلیگونی' : props.geomKind === 'line' ? 'خطی' : 'نقطه‌ای')
const maxCount = computed(() => Math.max(1, ...((local.value.classes || []).map(c => c.count ?? 0)), ...((local.value.uniqueValues || []).map(u => u.count ?? 0))))

function histH(c) {
  return `${Math.max(4, Math.round((c / maxCount.value) * 44))}px`
}
function methodDot(id) {
  const cols = { single: '#0f5c7e', unique: '#7c6a45', graduated: '#d53e4f', unclassed: '#fdae61', 'graduated-sym': '#3288bd', proportional: '#1a9850', heatmap: '#e7298a', dot: '#525252' }
  return { background: cols[id] ?? '#888' }
}
function swatch(it, big = false) {
  const s = it.size ?? (props.geomKind === 'point' ? 7 : 12)
  const px = big ? Math.max(10, Math.min(26, s + 6)) : Math.max(8, Math.min(20, s))
  if (props.geomKind === 'line') {
    return { background: 'transparent', borderTop: `4px solid ${it.color ?? '#888'}`, width: big ? '30px' : '22px', height: '0', borderRadius: '0' }
  }
  return { background: it.color ?? '#888', width: px + 'px', height: px + 'px', opacity: props.geomKind === 'polygon' ? 0.75 : 1 }
}
const heatPreview = computed(() => {
  const stops = [...(COLOR_RAMPS.find(r => r.id === local.value.heat.ramp)?.stops ?? [])]
  return `linear-gradient(to left, ${stops.join(',')})`
})

function emitUpdate() {
  // بازه proportional برای نرمال‌سازی سریع در رزولور
  if (local.value.renderer === 'proportional' && local.value.field) {
    const v = numericValues(props.rows, local.value.field)
    if (v.length) {
      local.value._minValue = v[0]
      local.value._maxValue = v[v.length - 1]
    }
  }
  emit('update:model-value', JSON.parse(JSON.stringify(local.value)))
  emit('update', local.value)
}
function setRenderer(id) {
  local.value.renderer = id
  const fnum = numericFields.value[0]?.key ?? null
  const fany = props.fields[0]?.key ?? null
  if (id === 'unique' && !local.value.field) local.value.field = fany
  if (['graduated', 'unclassed', 'graduated-sym', 'proportional'].includes(id) && !local.value.field) local.value.field = fnum
  if (['graduated', 'unclassed', 'graduated-sym'].includes(id)) reclassify()
  else if (id === 'unique') { if (!local.value.uniqueValues?.length) addAllValues() }
  else emitUpdate()
}
function onFieldChange() {
  if (local.value.renderer === 'unique') addAllValues()
  else if (['graduated', 'unclassed', 'graduated-sym'].includes(local.value.renderer)) reclassify()
  else emitUpdate()
}
function reclassify(rampId = null) {
  if (typeof rampId === 'string' && rampId !== local.value.colorRamp) local.value.colorRamp = rampId
  if (!local.value.field) { local.value.classes = []; emitUpdate(); return }
  if (local.value.method === 'manual' && !(local.value.manualBreaks?.length >= 2)) {
    // seed: شروع از فواصل مساوی تا کاربر دستی ویرایش کند
    const seed = numericValues(props.rows, local.value.field)
    local.value.manualBreaks = classifyBreaks(seed, 'equal', local.value.numClasses)
  }
  if (local.value.renderer === 'unclassed') {
    // پیوسته: 32 پله برای گرادیان نرم ولی لجند خلاصه 5تایی
    const full = buildGraduatedClasses(props.rows, { ...local.value, numClasses: 32, method: local.value.method === 'manual' ? 'equal' : local.value.method })
    local.value.classes = full
  } else {
    local.value.classes = buildGraduatedClasses(props.rows, local.value)
  }
  emitUpdate()
}
function manualEdited() {
  const cls = [...(local.value.classes || [])].sort((a, b) => a.min - b.min)
  local.value.classes = cls
  local.value.manualBreaks = [cls[0]?.min, ...cls.map(c => c.max)].filter(Number.isFinite)
  const n = cls.length
  const colors = sampleRamp(local.value.colorRamp, n, local.value.reversed)
  cls.forEach((c, i) => { c.color = colors[i]; c.label = `${c.min} – ${c.max}` })
  emitUpdate()
}
function addAllValues() {
  if (!local.value.field) return
  local.value.uniqueValues = buildUniqueValues(props.rows, local.value)
  emitUpdate()
}
function recolorUnique(rebuild = false, rampId = null) {
  // rampId مستقیم از RampPicker می‌آید تا به ترتیب اجرای v-model وابسته نباشیم
  if (rampId && rampId !== local.value.colorRamp) local.value.colorRamp = rampId
  if (rebuild && local.value.field && !local.value.uniqueValues?.length) { addAllValues(); return }
  const n = (local.value.uniqueValues || []).length
  if (!n) return
  // همیشه از رامپ انتخاب‌شده نمونه‌برداری کن (ترتیبی/واگرا هم روی مقادیر یکتا جواب می‌دهد)
  const colors = sampleRamp(local.value.colorRamp || 'category10', n, local.value.reversed)
  local.value.uniqueValues.forEach((u, i) => { u.color = colors[i] })
  emitUpdate()
}
function clearUnique() { local.value.uniqueValues = []; emitUpdate() }
function removeUnique(i) {
  const arr = filteredUnique.value
  const target = arr[i]
  const idx = local.value.uniqueValues.indexOf(target)
  if (idx >= 0) local.value.uniqueValues.splice(idx, 1)
  emitUpdate()
}
</script>

<style scoped>
.sym-overlay { position: fixed; inset: 0; z-index: 1200; background: rgba(15,23,32,0.55); backdrop-filter: blur(3px); display: flex; align-items: center; justify-content: center; padding: 16px; }
.sym-modal { width: min(1060px, 96vw); max-height: 92vh; display: flex; flex-direction: column; background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 14px; box-shadow: 0 24px 70px rgba(0,0,0,0.35); overflow: hidden; }
.sym-header { display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; border-bottom: 1px solid var(--border-subtle); background: var(--bg-panel-raised); }
.sym-title-wrap { display: flex; align-items: center; gap: 10px; }
.sym-title { font-size: 14px; font-weight: 800; color: var(--text-primary); }
.sym-sub { display: flex; gap: 8px; align-items: center; font-size: 11px; color: var(--text-muted); margin-top: 2px; }
.sym-geom { padding: 1px 8px; border-radius: 20px; background: var(--bg-hover); border: 1px solid var(--border-subtle); font-size: 10.5px; }
.sym-close { width: 30px; height: 30px; border-radius: 8px; border: 1px solid var(--border-subtle); background: var(--bg-panel); color: var(--text-muted); font-size: 18px; cursor: pointer; }
.sym-close:hover { color: var(--accent-danger); border-color: var(--accent-danger); }
.sym-body { display: grid; grid-template-columns: 220px 1fr 240px; gap: 12px; padding: 12px 16px; overflow: hidden; min-height: 0; }
.sym-methods { border-inline-end: 1px solid var(--border-subtle); padding-inline-end: 12px; overflow-y: auto; }
.sym-settings { overflow-y: auto; display: flex; flex-direction: column; gap: 10px; min-height: 0; max-height: 60vh; padding-inline-end: 4px; }
.sym-preview { border-inline-start: 1px solid var(--border-subtle); padding-inline-start: 12px; overflow-y: auto; }
.sym-sec { font-size: 11px; font-weight: 800; color: var(--text-muted); margin-bottom: 6px; }
.sym-method { display: flex; align-items: center; gap: 8px; width: 100%; text-align: right; padding: 8px 10px; border-radius: 8px; border: 1px solid transparent; background: transparent; color: var(--text-primary); font-family: inherit; font-size: 12px; cursor: pointer; margin-bottom: 4px; }
.sym-method:hover { background: var(--bg-hover); }
.sym-method.active { background: var(--brand-soft); border-color: var(--brand); font-weight: 700; }
.sym-method-dot { width: 12px; height: 12px; border-radius: 4px; flex-shrink: 0; }
.sym-card { background: var(--bg-panel-raised); border: 1px solid var(--border-subtle); border-radius: 10px; padding: 10px 12px; }
.sym-card-title { font-size: 12.5px; font-weight: 800; color: var(--text-primary); margin-bottom: 8px; }
.sym-row { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.sym-lbl { font-size: 11.5px; color: var(--text-secondary); font-weight: 600; }
.sym-select, .sym-input { background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 8px; color: var(--text-primary); font-family: inherit; font-size: 12px; padding: 7px 10px; min-width: 0; }
.sym-select { flex: 1; }
.sym-input { flex: 1; }
.sym-num { width: 86px; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 6px; color: var(--text-primary); font-size: 11px; padding: 4px 6px; }
.chk { display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: var(--text-secondary); }
.sym-warn { margin-top: 8px; font-size: 11.5px; color: #b45309; background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 6px 10px; }
.sym-grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 12px; }
.sym-classes { margin-top: 10px; display: flex; flex-direction: column; gap: 5px; max-height: 260px; overflow-y: auto; }
.sym-class-row { display: flex; align-items: center; gap: 8px; background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 5px 8px; font-size: 12px; }
.sym-class-row input[type="color"] { width: 26px; height: 22px; border: none; background: none; cursor: pointer; padding: 0; }
.sym-class-lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-primary); }
.sym-class-count { color: var(--text-muted); font-size: 11px; }
.mini-x { width: 22px; height: 22px; border-radius: 6px; border: 1px solid transparent; background: transparent; color: var(--text-muted); cursor: pointer; }
.mini-x:hover { color: var(--accent-danger); border-color: var(--border-subtle); }
.sym-empty { font-size: 12px; color: var(--text-muted); font-style: italic; text-align: center; padding: 10px; }
.sym-dot { border-radius: 50%; flex-shrink: 0; display: inline-block; }
.sym-hist { display: flex; align-items: flex-end; gap: 4px; height: 52px; background: var(--bg-panel); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 6px 8px 4px; margin-top: 10px; }
.sym-hist-col { flex: 1; display: flex; align-items: flex-end; justify-content: center; }
.sym-hist-bar { width: 100%; border-radius: 3px 3px 0 0; min-height: 4px; opacity: 0.9; }
.sym-note { font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.8; }
.sym-heat-prev { height: 18px; border-radius: 8px; margin-top: 10px; border: 1px solid var(--border-subtle); }
.sym-legend { display: flex; flex-direction: column; gap: 6px; }
.sym-leg-row { display: flex; align-items: center; gap: 8px; font-size: 12px; color: var(--text-primary); background: var(--bg-panel-raised); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 5px 8px; }
.sym-leg-swatch { border-radius: 50%; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.2); }
.sym-leg-grad { width: 60px; height: 14px; border-radius: 6px; flex-shrink: 0; border: 1px solid rgba(0,0,0,0.2); }
.sym-leg-lbl { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sym-leg-count { color: var(--text-muted); font-size: 11px; }
.sym-swatch-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.sym-big-dot { border-radius: 50%; border: 2px solid rgba(255,255,255,0.7); box-shadow: 0 1px 4px rgba(0,0,0,0.3); }
.sym-footer { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-top: 1px solid var(--border-subtle); background: var(--bg-panel-raised); }
.sym-hint { flex: 1; text-align: center; font-size: 11px; color: var(--text-muted); }
.btn { background: var(--bg-panel); border: 1px solid var(--border-strong); color: var(--text-primary); border-radius: 8px; padding: 7px 12px; font-family: inherit; font-size: 12px; font-weight: 700; cursor: pointer; }
.btn:hover { border-color: var(--brand); }
.btn-primary { background: var(--brand); border-color: var(--brand-strong); color: #fff; }
.btn-ghost { background: transparent; }
.mono { font-family: var(--font-mono); }
@media (max-width: 900px) {
  .sym-body { grid-template-columns: 1fr; overflow-y: auto; }
  .sym-methods, .sym-preview { border: none; padding: 0; }
  .sym-settings { max-height: none; }
}
</style>

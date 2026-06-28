<template>
  <div class="strat-wrap" dir="rtl">

    <!-- loading -->
    <div v-if="loading" class="strat-state">
      <div class="strat-spinner"></div>
      <p>در حال بارگذاری داده‌های چینه‌شناسی…</p>
    </div>

    <!-- error -->
    <div v-else-if="error" class="strat-state strat-state--error">
      <span class="strat-state__icon">⚠️</span>
      <p>{{ error }}</p>
    </div>

    <!-- empty -->
    <div v-else-if="!allWells.length" class="strat-state">
      <span class="strat-state__icon">🪨</span>
      <p>داده‌ای یافت نشد</p>
    </div>

    <!-- محتوا -->
    <template v-else>

      <!-- هدر -->
      <div class="strat-header">
        <div class="strat-header__brand">
          <span class="brand-icon">🪨</span>
          <div>
            <h2>نمودار کرلیشن چینه‌شناسی</h2>
            <p>مقایسه سازندهای زمین‌شناسی در چاه‌های انتخاب‌شده</p>
          </div>
        </div>

        <!-- فیلتر سازند -->
        <div class="strat-filters">
          <span class="filter-label">فیلتر سازند</span>
          <div class="filter-pills">
            <button
              v-for="f in formationDefs"
              :key="f.key"
              class="pill"
              :class="{ 'pill--active': activeFilter === f.key }"
              :style="activeFilter === f.key
                ? { background: f.color, borderColor: f.color, color: '#fff' }
                : { borderColor: f.color, color: f.color }"
              @click="activeFilter = f.key"
            >{{ f.label }}</button>
          </div>
        </div>
      </div>

      <!-- بدنه: پنل انتخاب چاه + چارت -->
      <div class="strat-content">

        <!-- پنل انتخاب چاه -->
        <div class="well-picker" :class="{ 'well-picker--closed': !pickerOpen }">
          <div class="well-picker__title" @click="pickerOpen = !pickerOpen">
            <span class="picker-toggle-icon">{{ pickerOpen ? '◀' : '▶' }}</span>
            <template v-if="pickerOpen">
              انتخاب چاه‌ها
              <span class="well-picker__count">{{ selectedKeys.size }} / {{ allWells.length }}</span>
            </template>
            <template v-else>
              <span class="well-picker__count well-picker__count--solo">{{ selectedKeys.size }}/{{ allWells.length }}</span>
            </template>
          </div>
          <template v-if="pickerOpen">
            <div class="well-picker__actions">
              <button class="picker-btn" @click="selectAll">همه</button>
              <button class="picker-btn" @click="clearAll">هیچ</button>
            </div>
            <div class="well-picker__list">
              <label
                v-for="w in allWells"
                :key="w._key"
                class="well-item"
                :class="{ 'well-item--active': selectedKeys.has(w._key) }"
              >
                <input
                  type="checkbox"
                  :checked="selectedKeys.has(w._key)"
                  @change="toggleWell(w._key)"
                />
                <span class="well-item__icon">🛢</span>
                <span class="well-item__name">{{ w.name }}</span>
                <span class="well-item__fm">{{ w.formations.length }} لایه</span>
              </label>
            </div>
            <div class="well-picker__hint" v-if="selectedKeys.size < 2">
              حداقل ۲ چاه انتخاب کنید
            </div>
          </template>
        </div>

        <!-- چارت -->
        <div class="strat-body" v-if="selectedWells.length >= 1">
          <div class="strat-canvas" :style="{ width: canvasW + 'px' }">

            <!-- عنوان -->
            <div class="chart-main-title">نمودار کرلیشن چینه‌شناسی</div>

            <!-- هدر چاه‌ها -->
            <div class="well-header-row">
              <div class="y-axis-gap">
                <div class="datum-tag">Datum<br><strong>Sea Level</strong></div>
              </div>
              <div class="well-headers" :style="{ gap: COL_GAP + 'px' }">
                <div
                  v-for="well in selectedWells"
                  :key="well._key"
                  class="well-head"
                  :style="{ width: COL_W + 'px' }"
                >
                  <div class="rig-icon">🛢</div>
                  <div class="well-head__name">{{ well.name }}</div>
                  <div class="well-head__coords">
                    <span>X = {{ well.x.toFixed(3) }}</span>
                    <span>Y = {{ well.y.toFixed(3) }}</span>
                  </div>
                </div>
              </div>
              <div class="y-axis-gap y-axis-gap--right">
                <span class="axis-unit">ارتفاع (m)</span>
              </div>
            </div>

            <!-- فریم چارت -->
            <div class="chart-frame">

              <!-- محور Y چپ -->
              <div class="y-axis y-axis--left" :style="{ height: CHART_H + 'px' }">
                <div v-for="t in yTicks" :key="t" class="y-tick" :style="{ top: toY(t) + 'px' }">{{ t }}</div>
              </div>

              <!-- plot-area -->
              <div class="plot-area" :style="{ width: plotW + 'px', height: CHART_H + 'px' }">

                <!-- گرید -->
                <svg class="grid-svg" :width="plotW" :height="CHART_H">
                  <line
                    v-for="t in yTicks" :key="'g'+t"
                    :x1="0" :y1="toY(t)" :x2="plotW" :y2="toY(t)"
                    stroke="#e8e4dc" stroke-width="1" stroke-dasharray="4,4"
                  />
                </svg>

                <!-- خط صفر -->
                <div class="datum-line" :style="{ top: toY(0) + 'px' }"></div>

                <!-- خطوط همبستگی -->
                <svg class="corr-svg" :width="plotW" :height="CHART_H">
                  <template v-for="(seg, i) in corrSegs" :key="'s'+i">
                    <line
                      v-if="isVisible(seg.fm)"
                      :x1="seg.x1" :y1="seg.y1" :x2="seg.x2" :y2="seg.y2"
                      :stroke="fmColor(seg.fm)" stroke-width="1.5"
                      :opacity="activeFilter === 'all' ? 0.5 : 0.9"
                      stroke-dasharray="6,3"
                    />
                  </template>
                </svg>

                <!-- ستون‌های چاه -->
                <div
                  v-for="(well, wi) in selectedWells"
                  :key="'col'+well._key"
                  class="well-col"
                  :style="{ left: colLeft(wi) + 'px', width: COL_W + 'px' }"
                >
                  <div
                    v-for="fm in well.formations"
                    :key="fm.name"
                    class="fm-block"
                    :class="{ 'fm-block--dim': !isVisible(fm.name) }"
                    :style="fmBlockStyle(fm)"
                    @mouseenter="e => onHover(e, well, fm)"
                    @mouseleave="onLeave"
                  >
                    <span v-if="fmBlockH(fm) >= 22" class="fm-block__label">{{ fm.name }}</span>
                  </div>

                  <!-- اعداد ارتفاع: بالای اولین لایه و پایین آخرین لایه -->
                  <span class="depth-num depth-num--top"
                    :style="{ top: toY(well.formations[0].top) + 'px' }">
                    {{ well.formations[0].top }}
                  </span>
                  <span class="depth-num"
                    :style="{ top: toY(well.formations.at(-1).base) + 'px' }">
                    {{ well.formations.at(-1).base }}
                  </span>

                  <!-- TD -->
                  <div class="td-mark" :style="{ top: toY(well.td) + 'px' }"></div>
                </div>
              </div>

              <!-- محور Y راست -->
              <div class="y-axis y-axis--right" :style="{ height: CHART_H + 'px' }">
                <div v-for="t in yTicks" :key="t" class="y-tick y-tick--right" :style="{ top: toY(t) + 'px' }">{{ t }}</div>
              </div>
            </div>

            <!-- محور X -->
            <div class="x-axis-row">
              <div class="y-axis-gap"></div>
              <div class="x-axis" :style="{ width: plotW + 'px' }">
                <div class="x-ticks">
                  <span v-for="d in xTicks" :key="d" class="x-tick">{{ d }}</span>
                </div>
                <div class="x-label">(m) فاصله تقریبی</div>
              </div>
              <div class="y-axis-gap"></div>
            </div>

            <!-- پانل‌های پایین -->
            <div class="bottom-panels">

              <!-- legend -->
              <div class="panel legend-panel">
                <div class="panel__title">راهنما (Legend)</div>
                <div v-for="f in formationDefs.filter(x => x.key !== 'all')" :key="'lg'+f.key" class="legend-row">
                  <span class="legend-swatch" :style="{ background: f.color }"></span>
                  <span class="legend-en">{{ f.key }}</span>
                </div>
              </div>

              <!-- جدول ضخامت -->
              <div class="panel thickness-panel">
                <div class="panel__title">ضخامت سازندها (m)</div>
                <div class="t-scroll">
                  <table class="t-table">
                    <thead>
                      <tr>
                        <th>سازند</th>
                        <th v-for="w in selectedWells" :key="w._key">{{ w.name }}</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr v-for="f in formationDefs.filter(x => x.key !== 'all')" :key="'tr'+f.key">
                        <td class="td-fm">
                          <span class="t-dot" :style="{ background: f.color }"></span>
                          {{ f.key }}
                        </td>
                        <td v-for="w in selectedWells" :key="w._key" class="td-num">
                          {{ thickness(w, f.key) }}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- توضیحات -->
              <div class="panel notes-panel">
                <div class="panel__title">توضیحات</div>
                <div class="note-row">
                  <span class="note-line note-line--blue">— — —</span>
                  <span>سطح دریا (Sea Level)</span>
                </div>
                <div class="note-row">
                  <span class="note-line note-line--dash">- - -</span>
                  <span>خطوط همبستگی</span>
                </div>
                <div class="note-small">اعداد: ارتفاع نسبت به سطح دریا (m)</div>
                <div class="note-small">چاه‌های نمایش: {{ selectedWells.length }}</div>
              </div>

            </div>
          </div>
        </div>

        <!-- حالت کمتر از ۱ چاه -->
        <div v-else class="strat-empty-chart">
          <span>🛢</span>
          <p>از پنل سمت راست چاه‌های مورد نظر را انتخاب کنید</p>
        </div>

      </div>

      <!-- پاپ‌آپ -->
      <Teleport to="body">
        <Transition name="popup">
          <div v-if="hovered" class="fm-popup" :style="{ top: popupPos.y + 'px', left: popupPos.x + 'px' }">
            <div class="fm-popup__header" :style="{ background: fmColor(hovered.fm.name) }">
              <span class="fm-popup__icon">🪨</span>
              <div>
                <div class="fm-popup__name">{{ hovered.fm.name }}</div>
                <div class="fm-popup__well">{{ hovered.well.name }}</div>
              </div>
            </div>
            <div class="fm-popup__body">
              <div class="fm-popup__row">
                <span class="fm-popup__key">سقف</span>
                <span class="fm-popup__val">{{ hovered.fm.top }} m</span>
              </div>
              <div class="fm-popup__row">
                <span class="fm-popup__key">کف</span>
                <span class="fm-popup__val">{{ hovered.fm.base }} m</span>
              </div>
              <div class="fm-popup__row fm-popup__row--hl">
                <span class="fm-popup__key">ضخامت</span>
                <span class="fm-popup__val fm-popup__val--bold">{{ Math.abs(hovered.fm.base - hovered.fm.top) }} m</span>
              </div>
            </div>
          </div>
        </Transition>
      </Teleport>

    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { fetchStratigraphyData } from '../composables/useGeoboxApi.js'

// ────────────────────────────────────────────
// Props
// ────────────────────────────────────────────
const props = defineProps({ wells: { type: Array, default: null } })

// ────────────────────────────────────────────
// Fetch
// ────────────────────────────────────────────
const apiWells = ref([])
const loading  = ref(false)
const error    = ref(null)

/**
 * چاه‌های خام رو نرمال می‌کنه:
 * ۱. _key یکتا اضافه می‌کنه (حتی اگه id تکراری باشه)
 * ۲. در هر سازند، top همیشه عدد بزرگ‌تر (ارتفاع بالاتر) و base کوچکتر میشه
 * ۳. لایه‌ها بر اساس top نزولی مرتب میشن (بالاترین ارتفاع اول)
 */
function normalizeWells(raw) {
  return raw.map((w, index) => {
    const formations = (w.formations ?? [])
      .map(fm => ({
        ...fm,
        top:  Math.max(fm.top, fm.base),   // ارتفاع بالایی
        base: Math.min(fm.top, fm.base),   // ارتفاع پایینی
      }))
      .sort((a, b) => b.top - a.top)       // از بالاترین به پایین‌ترین

    return {
      ...w,
      formations,
      _key: `well_${index}_${w.id ?? index}`,
    }
  })
}

onMounted(async () => {
  if (props.wells) {
    apiWells.value = normalizeWells(props.wells)
    initSelection()
    return
  }
  loading.value = true
  error.value   = null
  try {
    const raw = await fetchStratigraphyData()
    apiWells.value = normalizeWells(raw)
    initSelection()
  } catch (e) {
    error.value = e.message
  } finally {
    loading.value = false
  }
})

const allWells = computed(() => apiWells.value)

// ────────────────────────────────────────────
// انتخاب چاه — بر اساس _key یکتا
// ────────────────────────────────────────────
const selectedKeys = ref(new Set())
const pickerOpen   = ref(true)

function initSelection() {
  const keys = new Set()
  allWells.value.slice(0, 3).forEach(w => keys.add(w._key))
  selectedKeys.value = keys
}

function toggleWell(key) {
  const s = new Set(selectedKeys.value)
  if (s.has(key)) s.delete(key)
  else s.add(key)
  selectedKeys.value = s
}

function selectAll() {
  selectedKeys.value = new Set(allWells.value.map(w => w._key))
}

function clearAll() {
  selectedKeys.value = new Set()
}

const selectedWells = computed(() =>
  allWells.value.filter(w => selectedKeys.value.has(w._key))
)

// ────────────────────────────────────────────
// رنگ‌بندی سازندها
// ────────────────────────────────────────────
const FM_PALETTE = [
  '#3a9e6e', '#3a82c4', '#c9a800', '#c4503a', '#8a60be',
  '#2a8fa0', '#be7a30', '#6a9e3a', '#a04060', '#4a6abe',
  '#be5aab', '#5a9e8a', '#9e7a3a', '#3a4a9e', '#7a8a82',
  '#c47a3a', '#3a7ac4', '#9ec43a', '#c43a7a', '#3ac4be',
]

const allFormationNames = computed(() => {
  const seen = new Set()
  for (const w of allWells.value)
    for (const fm of w.formations) seen.add(fm.name)
  return [...seen]
})

const fmColorMap = computed(() => {
  const map = {}
  allFormationNames.value.forEach((name, i) => {
    map[name] = FM_PALETTE[i % FM_PALETTE.length]
  })
  return map
})

const formationDefs = computed(() => [
  { key: 'all', label: 'همه', color: '#607d8b' },
  ...allFormationNames.value.map(name => ({
    key: name,
    label: name,
    color: fmColorMap.value[name],
  }))
])

const fmColor = n => fmColorMap.value[n] ?? '#888'

const fmBg = n => {
  const c = fmColorMap.value[n]
  if (!c) return '#eee'
  const r = parseInt(c.slice(1,3), 16)
  const g = parseInt(c.slice(3,5), 16)
  const b = parseInt(c.slice(5,7), 16)
  return `rgba(${r},${g},${b},0.35)`
}

// ────────────────────────────────────────────
// فیلتر
// ────────────────────────────────────────────
const activeFilter = ref('all')
const isVisible    = n => activeFilter.value === 'all' || activeFilter.value === n

// ────────────────────────────────────────────
// ابعاد چارت
// ────────────────────────────────────────────
const COL_W   = 160
const COL_GAP = 80
const AXIS_W  = 72
const CHART_H = 660

const minDepth = computed(() => {
  let mn = Infinity
  for (const w of selectedWells.value)
    for (const fm of w.formations)
      mn = Math.min(mn, fm.top, fm.base)
  if (!isFinite(mn)) return -3500
  return Math.floor(mn / 500) * 500 - 500
})

const maxDepth = computed(() => {
  let mx = -Infinity
  for (const w of selectedWells.value)
    for (const fm of w.formations)
      mx = Math.max(mx, fm.top, fm.base)
  if (!isFinite(mx)) return 2000
  return Math.ceil(mx / 500) * 500 + 500
})

const plotW   = computed(() =>
  Math.max(selectedWells.value.length, 1) * COL_W +
  Math.max(selectedWells.value.length - 1, 0) * COL_GAP
)
const canvasW = computed(() => AXIS_W * 2 + plotW.value + 48)

// ارتفاع بزرگتر = بالاتر روی صفحه (y کمتر)
const toY = d => {
  const range = maxDepth.value - minDepth.value
  if (!range) return 0
  return ((maxDepth.value - d) / range) * CHART_H
}

const colLeft = wi => wi * (COL_W + COL_GAP)

const yTicks = computed(() => {
  const t = []
  for (let d = maxDepth.value; d >= minDepth.value; d -= 500) t.push(d)
  return t
})

const xTicks = computed(() => {
  const n = selectedWells.value.length
  const tot = (n - 1) * 500
  const t = []
  for (let i = 0; i <= tot; i += 250) t.push(i)
  return t
})

// ────────────────────────────────────────────
// استایل بلوک سازند — اصلاح‌شده
// ────────────────────────────────────────────
// بعد از normalizeWells: top > base همیشه
// toY(top) < toY(base) چون ارتفاع بیشتر = بالاتر = y کمتر
function fmBlockH(fm) {
  return Math.max(toY(fm.base) - toY(fm.top), 4)
}

function fmBlockStyle(fm) {
  const topPx  = toY(fm.top)
  const height = Math.max(toY(fm.base) - toY(fm.top), 4)
  const color  = fmColor(fm.name)
  return {
    position:     'absolute',
    left:         '2px',
    right:        '2px',
    top:          topPx + 'px',
    height:       height + 'px',
    background:   fmBg(fm.name),
    borderTop:    `2px solid ${color}`,
    borderBottom: `2px solid ${color}`,
  }
}

// ────────────────────────────────────────────
// خطوط همبستگی
// ────────────────────────────────────────────
const corrSegs = computed(() => {
  const segs = []
  for (let wi = 0; wi < selectedWells.value.length - 1; wi++) {
    const w1 = selectedWells.value[wi]
    const w2 = selectedWells.value[wi + 1]
    for (const name of allFormationNames.value) {
      const f1 = w1.formations.find(f => f.name === name)
      const f2 = w2.formations.find(f => f.name === name)
      if (!f1 || !f2) continue
      // خط سقف (top) — toY(top) همیشه y کمتره
      segs.push({
        fm: name,
        x1: colLeft(wi) + COL_W, y1: toY(f1.top),
        x2: colLeft(wi + 1),     y2: toY(f2.top),
      })
      // خط کف (base)
      segs.push({
        fm: name,
        x1: colLeft(wi) + COL_W, y1: toY(f1.base),
        x2: colLeft(wi + 1),     y2: toY(f2.base),
      })
    }
  }
  return segs
})

// ────────────────────────────────────────────
// Hover / Popup
// ────────────────────────────────────────────
const hovered  = ref(null)
const popupPos = ref({ x: 0, y: 0 })

function onHover(e, well, fm) {
  hovered.value = { well, fm }
  place(e)
  window.addEventListener('mousemove', onMove)
}
function onLeave() {
  hovered.value = null
  window.removeEventListener('mousemove', onMove)
}
function onMove(e) { if (hovered.value) place(e) }
function place(e) {
  const pw = 240, ph = 160, vw = window.innerWidth, vh = window.innerHeight
  let x = e.clientX + 18, y = e.clientY - 24
  if (x + pw > vw - 8) x = e.clientX - pw - 18
  if (y + ph > vh - 8) y = vh - ph - 8
  popupPos.value = { x, y }
}

// ────────────────────────────────────────────
// ضخامت
// ────────────────────────────────────────────
const thickness = (well, name) => {
  const f = well.formations.find(x => x.name === name)
  return f ? Math.abs(f.base - f.top) : '—'
}
</script>

<style scoped>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ══ wrapper ══════════════════════════════════════════════════════════ */
.strat-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #f2efe8;
  font-family: 'Vazirmatn', 'Tahoma', system-ui, sans-serif;
  color: #1e2a22;
}

/* ══ states ════════════════════════════════════════════════════════════ */
.strat-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 16px;
  color: #6a8070;
  font-size: 14px;
}
.strat-state--error { color: #b03030; }
.strat-state__icon  { font-size: 36px; opacity: .5; }
.strat-spinner {
  width: 36px; height: 36px;
  border: 3px solid #d4cfc6;
  border-top-color: #3a9e6e;
  border-radius: 50%;
  animation: spin .7s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }

/* ══ هدر ══════════════════════════════════════════════════════════════ */
.strat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 12px 20px;
  background: #ffffff;
  border-bottom: 2px solid #d8d2c8;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}
.strat-header__brand { display: flex; align-items: center; gap: 12px; }
.brand-icon { font-size: 20px; }
.strat-header__brand h2 { font-size: 14px; font-weight: 800; color: #1e2a22; margin-bottom: 1px; }
.strat-header__brand p  { font-size: 11px; color: #7a8a80; }

.strat-filters { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.filter-label  { font-size: 11px; color: #6a7a70; font-weight: 600; white-space: nowrap; }
.filter-pills  { display: flex; gap: 5px; flex-wrap: wrap; max-width: 560px; }

.pill {
  padding: 3px 10px;
  border-radius: 16px;
  border: 1.5px solid;
  background: transparent;
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all .18s;
  font-family: inherit;
}
.pill:hover { opacity: .75; }
.pill--active { box-shadow: 0 2px 8px rgba(0,0,0,.15); }

/* ══ layout اصلی ══════════════════════════════════════════════════════ */
.strat-content {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}

/* ══ پنل انتخاب چاه ══════════════════════════════════════════════════ */
.well-picker {
  width: 200px;
  flex-shrink: 0;
  background: #ffffff;
  border-left: 1px solid #d8d2c8;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  transition: width .25s ease;
}
.well-picker--closed {
  width: 36px;
}
.well-picker__title {
  padding: 12px 10px;
  font-size: 12.5px;
  font-weight: 800;
  color: #1e2a22;
  border-bottom: 1px solid #ebe7de;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
  white-space: nowrap;
  overflow: hidden;
}
.well-picker__title:hover { background: #f5f2ec; }
.picker-toggle-icon {
  font-size: 10px;
  color: #3a9e6e;
  flex-shrink: 0;
}
.well-picker__count {
  font-size: 11px;
  font-weight: 600;
  color: #3a9e6e;
  background: #eaf7f1;
  padding: 2px 7px;
  border-radius: 10px;
  flex-shrink: 0;
}
.well-picker__count--solo {
  padding: 2px 4px;
  font-size: 10px;
}
.well-picker__actions {
  display: flex;
  gap: 6px;
  padding: 8px 14px;
  border-bottom: 1px solid #ebe7de;
  flex-shrink: 0;
}
.picker-btn {
  flex: 1;
  padding: 5px 0;
  font-size: 11.5px;
  font-weight: 700;
  border: 1px solid #ccc;
  border-radius: 6px;
  background: #f7f5f0;
  color: #3a4a3e;
  cursor: pointer;
  font-family: inherit;
  transition: background .15s;
}
.picker-btn:hover { background: #ebe7de; }

.well-picker__list {
  flex: 1;
  overflow-y: auto;
  padding: 6px 0;
}

.well-item {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 7px 14px;
  cursor: pointer;
  transition: background .12s;
  border-bottom: 1px solid #f5f2ec;
  font-size: 12px;
}
.well-item:last-child { border-bottom: none; }
.well-item:hover { background: #f5f2ec; }
.well-item--active { background: #eaf7f1; }
.well-item input[type="checkbox"] { accent-color: #3a9e6e; width: 14px; height: 14px; cursor: pointer; flex-shrink: 0; }
.well-item__icon { font-size: 14px; flex-shrink: 0; }
.well-item__name { flex: 1; font-weight: 700; color: #1e2a22; font-size: 11.5px; }
.well-item__fm   { font-size: 10px; color: #7a8a80; white-space: nowrap; }

.well-picker__hint {
  padding: 8px 14px;
  font-size: 10.5px;
  color: #c07030;
  text-align: center;
  border-top: 1px solid #ebe7de;
  flex-shrink: 0;
}

/* ══ بدنه چارت ═══════════════════════════════════════════════════════ */
.strat-body {
  flex: 1;
  overflow: auto;
  padding: 20px 24px 36px;
}

.strat-empty-chart {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  color: #9aaa9a;
  font-size: 14px;
}
.strat-empty-chart span { font-size: 40px; opacity: .4; }

/* ══ عنوان ═════════════════════════════════════════════════════════════ */
.chart-main-title {
  text-align: center;
  font-size: 16px;
  font-weight: 900;
  color: #1e2a22;
  margin-bottom: 14px;
}

/* ══ هدر چاه‌ها ════════════════════════════════════════════════════════ */
.well-header-row { display: flex; align-items: flex-end; margin-bottom: 0; }
.y-axis-gap {
  width: 72px; flex-shrink: 0;
  display: flex; align-items: flex-end; justify-content: flex-end;
  padding-bottom: 6px; padding-left: 8px;
}
.y-axis-gap--right { justify-content: flex-start; }
.datum-tag { font-size: 10px; color: #5a7260; font-weight: 700; text-align: right; line-height: 1.5; }
.axis-unit { font-size: 11px; font-weight: 700; color: #5a7260; }

.well-headers { display: flex; flex: 1; }
.well-head { display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
.rig-icon { font-size: 22px; line-height: 1; }
.well-head__name   { font-size: 12.5px; font-weight: 900; color: #1e2a22; }
.well-head__coords { display: flex; flex-direction: column; gap: 1px; }
.well-head__coords span { font-size: 9px; color: #6a8070; font-family: monospace; }

/* ══ فریم ═══════════════════════════════════════════════════════════════ */
.chart-frame {
  display: flex;
  border-top: 2.5px solid #3a4a3e;
  border-bottom: 2.5px solid #3a4a3e;
  background: #ffffff;
  box-shadow: 0 4px 24px rgba(0,0,0,.08);
}

/* ══ محور Y ════════════════════════════════════════════════════════════ */
.y-axis { width: 72px; flex-shrink: 0; position: relative; background: #f7f5f0; }
.y-axis--left  { border-left: 2.5px solid #3a4a3e; border-right: 1px solid #dedad2; }
.y-axis--right { border-right: 2.5px solid #3a4a3e; border-left: 1px solid #dedad2; }

.y-tick {
  position: absolute;
  font-size: 10px;
  font-family: monospace;
  font-weight: 600;
  color: #3a4a3e;
  transform: translateY(-50%);
  white-space: nowrap;
}
.y-axis--left  .y-tick { right: 8px; }
.y-axis--right .y-tick { left: 8px; }
.y-axis--left  .y-tick::after  { content:''; position:absolute; left:100%; top:50%; width:5px; height:1px; background:#3a4a3e; margin-left:1px; }
.y-axis--right .y-tick::before { content:''; position:absolute; right:100%; top:50%; width:5px; height:1px; background:#3a4a3e; margin-right:1px; }

/* ══ plot-area ══════════════════════════════════════════════════════════ */
.plot-area { flex: 1; position: relative; overflow: hidden; }
.grid-svg, .corr-svg { position: absolute; top:0; left:0; pointer-events: none; }
.grid-svg { z-index: 1; }
.corr-svg { z-index: 3; }

.datum-line {
  position: absolute; left:0; right:0;
  border-top: 2px dashed #2196f3;
  z-index: 4; pointer-events: none;
}

/* ══ ستون چاه ══════════════════════════════════════════════════════════ */
.well-col { position: absolute; top:0; height:100%; z-index:2; }

.fm-block {
  position: absolute;
  left: 2px;
  right: 2px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: opacity .2s, filter .2s;
  z-index: 2;
  overflow: hidden;
  border-radius: 2px;
}
.fm-block--dim { opacity: .08; pointer-events: none; }
.fm-block:not(.fm-block--dim):hover {
  filter: brightness(1.1) saturate(1.15);
  z-index: 10;
  box-shadow: 0 0 0 2px rgba(0,0,0,.25);
}

.fm-block__label {
  font-size: 10.5px; font-weight: 800;
  color: #1a1a1a;
  text-shadow: 0 1px 2px rgba(255,255,255,.8);
  pointer-events: none; user-select: none;
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  padding: 0 4px;
  max-width: 100%;
}

/* اعداد ارتفاع */
.depth-num {
  position: absolute;
  font-size: 9px;
  font-family: monospace;
  font-weight: 700;
  color: #2e3e32;
  right: calc(100% + 3px);
  white-space: nowrap;
  pointer-events: none;
  transform: translateY(-50%);
  background: rgba(255,255,255,.75);
  padding: 0 2px;
  border-radius: 2px;
}

/* TD */
.td-mark { position: absolute; left:0; right:0; border-top: 3px solid #1e2a22; z-index:6; }
.td-mark::after {
  content: 'TD';
  position: absolute; right: calc(100% + 2px); top: -8px;
  font-size: 8px; font-family: monospace; font-weight: 700; color: #1e2a22;
}

/* ══ محور X ════════════════════════════════════════════════════════════ */
.x-axis-row { display: flex; align-items: flex-start; margin-top: 0; }
.x-axis { border-top: 2.5px solid #3a4a3e; padding-top: 4px; }
.x-ticks { display: flex; justify-content: space-between; }
.x-tick  { font-size: 10px; font-family: monospace; font-weight: 600; color: #3a4a3e; }
.x-label { text-align: center; font-size: 11px; font-weight: 700; color: #3a4a3e; margin-top: 4px; }

/* ══ پانل‌های پایین ════════════════════════════════════════════════════ */
.bottom-panels {
  display: flex;
  gap: 16px;
  margin-top: 20px;
  flex-wrap: wrap;
  justify-content: center;
  align-items: flex-start;
}

.panel {
  background: #ffffff;
  border: 1.5px solid #d4cfc6;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 10px rgba(0,0,0,.06);
}
.panel__title {
  font-size: 12px; font-weight: 800;
  color: #1e2a22;
  background: #eae6de;
  padding: 7px 14px;
  text-align: center;
  border-bottom: 1.5px solid #d4cfc6;
}

/* legend */
.legend-panel { min-width: 180px; max-height: 260px; overflow-y: auto; }
.legend-row {
  display: flex; align-items: center; gap: 8px;
  padding: 5px 14px;
  border-bottom: 1px solid #f0ece4;
  font-size: 11.5px;
}
.legend-row:last-child { border-bottom: none; }
.legend-swatch { width: 26px; height: 13px; border-radius: 3px; border: 1px solid rgba(0,0,0,.1); flex-shrink: 0; }
.legend-en { font-family: monospace; font-size: 11px; color: #3a4a3e; }

/* جدول ضخامت */
.thickness-panel { }
.t-scroll { max-height: 260px; overflow: auto; }
.t-table { width: 100%; border-collapse: collapse; font-size: 11.5px; direction: rtl; }
.t-table th,
.t-table td { border: 1px solid #e0dbd2; padding: 5px 10px; text-align: center; white-space: nowrap; }
.t-table thead th {
  background: #f0ece4; font-weight: 800; color: #1e2a22;
  font-size: 11.5px; position: sticky; top: 0; z-index: 1;
}
.td-fm  { text-align: right !important; font-weight: 700; color: #1e2a22; }
.td-num { font-family: monospace; font-size: 12px; font-weight: 700; color: #2e4a38; }
.t-dot  { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-left: 5px; vertical-align: middle; }

/* توضیحات */
.notes-panel { min-width: 200px; }
.note-row {
  display: flex; align-items: center; gap: 8px;
  padding: 6px 14px;
  border-bottom: 1px solid #f0ece4;
  font-size: 12px; color: #3a4a3e;
}
.note-row:last-of-type { border-bottom: none; }
.note-line       { font-family: monospace; font-size: 14px; letter-spacing: 2px; color: #4a5a50; }
.note-line--blue { color: #2196f3; }
.note-line--dash { color: #5a7260; letter-spacing: 3px; }
.note-small      { padding: 5px 14px; font-size: 10.5px; color: #7a8a80; }

/* ══ پاپ‌آپ ════════════════════════════════════════════════════════════ */
.fm-popup {
  position: fixed; z-index: 9999;
  width: 230px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.05);
  pointer-events: none;
}
.fm-popup__header {
  display: flex; align-items: center; gap: 10px;
  padding: 11px 14px; color: #fff;
}
.fm-popup__icon { font-size: 18px; flex-shrink: 0; }
.fm-popup__name { font-size: 13.5px; font-weight: 900; text-shadow: 0 1px 3px rgba(0,0,0,.25); }
.fm-popup__well { font-size: 10px; opacity: .85; margin-top: 1px; }
.fm-popup__body { padding: 4px 0 2px; }
.fm-popup__row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 6px 14px;
  border-bottom: 1px solid #f2efe8;
}
.fm-popup__row:last-child { border-bottom: none; }
.fm-popup__row--hl  { background: #f7f4ee; }
.fm-popup__key      { font-size: 11px; color: #7a8a80; font-weight: 600; }
.fm-popup__val      { font-size: 12px; color: #1e2a22; font-family: monospace; font-weight: 600; }
.fm-popup__val--bold{ font-weight: 900; font-size: 13.5px; color: #1e6a44; }

/* ══ انیمیشن ═══════════════════════════════════════════════════════════ */
.popup-enter-active { transition: opacity .15s ease, transform .15s ease; }
.popup-leave-active { transition: opacity .10s ease; }
.popup-enter-from   { opacity: 0; transform: translateY(5px) scale(.97); }
.popup-leave-to     { opacity: 0; }
</style>

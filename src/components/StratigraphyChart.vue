<template>
  <div class="strat-wrap" dir="rtl">

    <!-- هدر -->
    <div class="strat-header">
      <div class="strat-header__brand">
        <span class="brand-icon">🪨</span>
        <div>
          <h2>نمودار کرلیشن چینه‌شناسی</h2>
          <p>مقایسه سازندهای زمین‌شناسی در چاه‌های انتخاب‌شده</p>
        </div>
      </div>
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

    <!-- بدنه -->
    <div class="strat-body">
      <div class="strat-canvas" :style="{ width: canvasW + 'px' }">

        <!-- عنوان -->
        <div class="chart-main-title">نمودار کرلیشن چینه‌شناسی</div>

        <!-- هدر چاه‌ها -->
        <div class="well-header-row">
          <div class="y-axis-gap">
            <div class="datum-tag">Datum<br><strong>Top Asmari</strong></div>
          </div>
          <div class="well-headers">
            <div
              v-for="well in wells"
              :key="well.id"
              class="well-head"
              :style="{ width: COL_W + 'px' }"
            >
              <div class="rig-icon">🛢</div>
              <div class="well-head__name">چاه {{ well.name }}</div>
              <div class="well-head__coords">
                <span>X = {{ well.x.toLocaleString() }}</span>
                <span>Y = {{ well.y.toLocaleString() }}</span>
              </div>
            </div>
          </div>
          <div class="y-axis-gap y-axis-gap--right">
            <span class="axis-unit">عمق (m)</span>
          </div>
        </div>

        <!-- فریم چارت -->
        <div class="chart-frame">

          <!-- محور Y چپ -->
          <div class="y-axis y-axis--left">
            <div v-for="t in yTicks" :key="t" class="y-tick" :style="{ top: toY(t) + 'px' }">{{ t }}</div>
          </div>

          <!-- plot-area -->
          <div class="plot-area" :style="{ width: plotW + 'px', height: CHART_H + 'px' }">

            <svg class="grid-svg" :width="plotW" :height="CHART_H">
              <line
                v-for="t in yTicks" :key="'g'+t"
                :x1="0" :y1="toY(t)" :x2="plotW" :y2="toY(t)"
                stroke="#e8e4dc" stroke-width="1" stroke-dasharray="4,4"
              />
            </svg>

            <div class="datum-line" :style="{ top: toY(0) + 'px' }"></div>

            <svg class="corr-svg" :width="plotW" :height="CHART_H">
              <template v-for="(seg, i) in corrSegs" :key="'s'+i">
                <line
                  v-if="isVisible(seg.fm)"
                  :x1="seg.x1" :y1="seg.y1" :x2="seg.x2" :y2="seg.y2"
                  :stroke="fmColor(seg.fm)" stroke-width="2"
                  :opacity="activeFilter === 'all' ? 0.65 : 1"
                />
              </template>
            </svg>

            <div
              v-for="(well, wi) in wells"
              :key="'col'+well.id"
              class="well-col"
              :style="{ left: colLeft(wi) + 'px', width: COL_W + 'px' }"
            >
              <div
                v-for="fm in well.formations"
                :key="fm.name"
                class="fm-block"
                :class="{ 'fm-block--dim': !isVisible(fm.name) }"
                :style="{
                  top: toY(fm.top) + 'px',
                  height: Math.max(toY(fm.base) - toY(fm.top), 16) + 'px',
                  background: fmBg(fm.name),
                  borderTop: `2px solid ${fmColor(fm.name)}`,
                  borderBottom: `2px solid ${fmColor(fm.name)}`,
                }"
                @mouseenter="e => onHover(e, well, fm)"
                @mouseleave="onLeave"
              >
                <span class="fm-block__label">{{ fmLabel(fm.name) }}</span>
              </div>

              <!-- اعداد عمق -->
              <template v-for="fm in well.formations" :key="'dt'+fm.name">
                <span class="depth-num" :style="{ top: toY(fm.top) + 'px' }">{{ fm.top }}</span>
              </template>
              <span class="depth-num" :style="{ top: toY(well.formations.at(-1).base) + 'px' }">
                {{ well.formations.at(-1).base }}
              </span>

              <div class="td-mark" :style="{ top: toY(well.td) + 'px' }"></div>
            </div>
          </div>

          <!-- محور Y راست -->
          <div class="y-axis y-axis--right">
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
            <div class="x-label">(m) فاصله</div>
          </div>
          <div class="y-axis-gap"></div>
        </div>

        <!-- پانل‌های پایین -->
        <div class="bottom-panels">

          <div class="panel legend-panel">
            <div class="panel__title">راهنما (Legend)</div>
            <div v-for="f in formationDefs.filter(x => x.key !== 'all')" :key="'lg'+f.key" class="legend-row">
              <span class="legend-swatch" :style="{ background: f.color }"></span>
              <span class="legend-en">{{ f.key }}</span>
              <span class="legend-fa">{{ f.label }}</span>
            </div>
          </div>

          <div class="panel thickness-panel">
            <div class="panel__title">ضخامت سازندها (m)</div>
            <table class="t-table">
              <thead>
                <tr>
                  <th>سازند</th>
                  <th v-for="w in wells" :key="w.id">چاه {{ w.name }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="f in formationDefs.filter(x => x.key !== 'all')" :key="'tr'+f.key">
                  <td class="td-fm">
                    <span class="t-dot" :style="{ background: f.color }"></span>
                    {{ f.label }}
                  </td>
                  <td v-for="w in wells" :key="w.id" class="td-num">{{ thickness(w, f.key) }}</td>
                </tr>
              </tbody>
            </table>
          </div>

          <div class="panel notes-panel">
            <div class="panel__title">توضیحات</div>
            <div class="note-row">
              <span class="note-line note-line--blue">— — —</span>
              <span>دیتوم: سقف آسماری</span>
            </div>
            <div class="note-row">
              <span class="note-line">———</span>
              <span>خطوط همبستگی</span>
            </div>
            <div class="note-small">اعداد کنار ستون‌ها: عمق واقعی (m)</div>
          </div>

        </div>
      </div>
    </div>

    <!-- پاپ‌آپ -->
    <Teleport to="body">
      <Transition name="popup">
        <div v-if="hovered" class="fm-popup" :style="{ top: popupPos.y + 'px', left: popupPos.x + 'px' }">
          <div class="fm-popup__header" :style="{ background: fmColor(hovered.fm.name) }">
            <span class="fm-popup__icon">🪨</span>
            <div>
              <div class="fm-popup__name">{{ fmLabel(hovered.fm.name) }}</div>
              <div class="fm-popup__well">{{ hovered.well.name }} · {{ hovered.well.field }}</div>
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
              <span class="fm-popup__val fm-popup__val--bold">{{ hovered.fm.base - hovered.fm.top }} m</span>
            </div>
            <div class="fm-popup__row">
              <span class="fm-popup__key">میدان</span>
              <span class="fm-popup__val">{{ hovered.well.field }}</span>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>

  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const staticWells = [
  {
    id: 'W-001', name: 'A', field: 'میدان آغاجاری',
    x: 523450, y: 3169850, td: 3800,
    formations: [
      { name: 'Asmari',  top: 0,    base: 600  },
      { name: 'Pabdeh',  top: 600,  base: 1500 },
      { name: 'Gurpi',   top: 1500, base: 2500 },
      { name: 'Ahwaz',   top: 2500, base: 3200 },
      { name: 'Dehkhah', top: 3200, base: 3800 },
    ]
  },
  {
    id: 'W-002', name: 'B', field: 'میدان آغاجاری',
    x: 523950, y: 3169920, td: 4000,
    formations: [
      { name: 'Asmari',  top: 0,    base: 700  },
      { name: 'Pabdeh',  top: 700,  base: 1800 },
      { name: 'Gurpi',   top: 1800, base: 2800 },
      { name: 'Ahwaz',   top: 2800, base: 3500 },
      { name: 'Dehkhah', top: 3500, base: 4000 },
    ]
  },
  {
    id: 'W-003', name: 'C', field: 'میدان مسجدسلیمان',
    x: 524450, y: 3169980, td: 3700,
    formations: [
      { name: 'Asmari',  top: 0,    base: 500  },
      { name: 'Pabdeh',  top: 500,  base: 1300 },
      { name: 'Gurpi',   top: 1300, base: 2300 },
      { name: 'Ahwaz',   top: 2300, base: 3100 },
      { name: 'Dehkhah', top: 3100, base: 3700 },
    ]
  },
]

const props = defineProps({ wells: { type: Array } })
const wells = computed(() => props.wells ?? staticWells)

const formationDefs = [
  { key: 'all',     label: 'همه',    color: '#607d8b' },
  { key: 'Asmari',  label: 'آسماری', color: '#3a9e6e' },
  { key: 'Pabdeh',  label: 'پابده',  color: '#3a82c4' },
  { key: 'Gurpi',   label: 'گوریپی', color: '#c9a800' },
  { key: 'Ahwaz',   label: 'آهواز',  color: '#8a60be' },
  { key: 'Dehkhah', label: 'دهگاه',  color: '#7a8a82' },
]

const fmMeta = {
  Asmari:  { label: 'آسماری', color: '#3a9e6e', bg: 'rgba(58,158,110,0.42)'  },
  Pabdeh:  { label: 'پابده',  color: '#3a82c4', bg: 'rgba(58,130,196,0.42)'  },
  Gurpi:   { label: 'گوریپی', color: '#c9a800', bg: 'rgba(201,168,0,0.50)'   },
  Ahwaz:   { label: 'آهواز',  color: '#8a60be', bg: 'rgba(138,96,190,0.45)'  },
  Dehkhah: { label: 'دهگاه',  color: '#7a8a82', bg: 'repeating-linear-gradient(135deg,#b8bdb8 0,#b8bdb8 3px,#e0e4e0 3px,#e0e4e0 9px)' },
}

const fmColor = n => fmMeta[n]?.color ?? '#888'
const fmBg    = n => fmMeta[n]?.bg    ?? '#eee'
const fmLabel = n => fmMeta[n]?.label ?? n

const activeFilter = ref('all')
const isVisible    = n => activeFilter.value === 'all' || activeFilter.value === n

const COL_W   = 170
const COL_GAP = 90
const AXIS_W  = 72
const CHART_H = 620
const MIN_D   = 0
const MAX_D   = 4200

const plotW   = computed(() => wells.value.length * COL_W + (wells.value.length - 1) * COL_GAP)
const canvasW = computed(() => AXIS_W * 2 + plotW.value + 48)

const toY     = d => ((d - MIN_D) / (MAX_D - MIN_D)) * CHART_H
const colLeft = wi => wi * (COL_W + COL_GAP)

const yTicks = computed(() => { const t=[]; for(let d=MIN_D;d<=MAX_D;d+=500) t.push(d); return t })
const xTicks = computed(() => { const n=wells.value.length; const tot=(n-1)*500; const t=[]; for(let i=0;i<=tot;i+=250) t.push(i); return t })

const corrSegs = computed(() => {
  const segs=[], fms=['Asmari','Pabdeh','Gurpi','Ahwaz','Dehkhah']
  for (let wi=0; wi<wells.value.length-1; wi++) {
    const w1=wells.value[wi], w2=wells.value[wi+1]
    for (const fm of fms) {
      const f1=w1.formations.find(f=>f.name===fm)
      const f2=w2.formations.find(f=>f.name===fm)
      if (!f1||!f2) continue
      segs.push({ fm, x1: colLeft(wi)+COL_W, y1: toY(f1.top),  x2: colLeft(wi+1), y2: toY(f2.top)  })
      segs.push({ fm, x1: colLeft(wi)+COL_W, y1: toY(f1.base), x2: colLeft(wi+1), y2: toY(f2.base) })
    }
  }
  return segs
})

const hovered  = ref(null)
const popupPos = ref({ x: 0, y: 0 })

function onHover(e, well, fm) {
  hovered.value = { fmKey: fm.name+well.id, well, fm }
  place(e)
  window.addEventListener('mousemove', onMove)
}
function onLeave() {
  hovered.value = null
  window.removeEventListener('mousemove', onMove)
}
function onMove(e) { if (hovered.value) place(e) }
function place(e) {
  const pw=240, ph=170, vw=window.innerWidth, vh=window.innerHeight
  let x=e.clientX+18, y=e.clientY-24
  if (x+pw>vw-8) x=e.clientX-pw-18
  if (y+ph>vh-8) y=vh-ph-8
  popupPos.value={x,y}
}

const thickness = (well, name) => {
  const f=well.formations.find(x=>x.name===name)
  return f ? f.base-f.top : '—'
}
</script>

<style scoped>
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

/* ══ wrapper ══════════════════════════════════════════════════════════════════ */
.strat-wrap {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #f2efe8;
  font-family: 'Vazirmatn', 'Tahoma', system-ui, sans-serif;
  color: #1e2a22;
}

/* ══ هدر روشن ════════════════════════════════════════════════════════════════ */
.strat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 14px;
  padding: 14px 22px;
  background: #ffffff;
  border-bottom: 2px solid #d8d2c8;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,.06);
}

.strat-header__brand { display: flex; align-items: center; gap: 12px; }
.brand-icon { font-size: 22px; }
.strat-header__brand h2 {
  font-size: 14.5px;
  font-weight: 800;
  color: #1e2a22;
  margin-bottom: 2px;
}
.strat-header__brand p { font-size: 11px; color: #7a8a80; }

.strat-filters { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.filter-label  { font-size: 11.5px; color: #6a7a70; font-weight: 600; }
.filter-pills  { display: flex; gap: 6px; flex-wrap: wrap; }

.pill {
  padding: 5px 14px;
  border-radius: 20px;
  border: 1.5px solid;
  background: transparent;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  transition: all .18s;
  font-family: inherit;
}
.pill:hover { opacity: .75; transform: translateY(-1px); }
.pill--active { box-shadow: 0 3px 10px rgba(0,0,0,.18); }

/* ══ بدنه ════════════════════════════════════════════════════════════════════ */
.strat-body {
  flex: 2;
  overflow: auto;
  padding: 24px 28px 40px;
  display: flex;          /* ← اضافه */
  justify-content: center;
}

/* ══ عنوان ═══════════════════════════════════════════════════════════════════ */
.chart-main-title {
  text-align: center;
  font-size: 17px;
  font-weight: 900;
  color: #1e2a22;
  margin-bottom: 16px;
  letter-spacing: .02em;
}

/* ══ هدر چاه‌ها ══════════════════════════════════════════════════════════════ */
.well-header-row { display: flex; align-items: flex-end; margin-bottom: 0; }
.y-axis-gap {
  width: 72px; flex-shrink: 0;
  display: flex; align-items: flex-end; justify-content: flex-end;
  padding-bottom: 6px; padding-left: 8px;
}
.y-axis-gap--right { justify-content: flex-start; padding-left: 8px; }
.datum-tag { font-size: 10px; color: #5a7260; font-weight: 700; text-align: right; line-height: 1.5; }
.axis-unit { font-size: 11px; font-weight: 700; color: #5a7260; }

.well-headers { display: flex; gap: 90px; flex: 1; margin-right: 5%;}
.well-head { display: flex; flex-direction: column; align-items: center; gap: 3px; text-align: center; }
.rig-icon      { font-size: 26px; line-height: 1; }
.well-head__name   { font-size: 14px; font-weight: 900; color: #1e2a22; }
.well-head__coords { display: flex; flex-direction: column; gap: 1px; }
.well-head__coords span { font-size: 9.5px; color: #6a8070; font-family: monospace; }

/* ══ فریم چارت ══════════════════════════════════════════════════════════════ */
.chart-frame {
  display: flex;
  border-top: 2.5px solid #3a4a3e;
  border-bottom: 2.5px solid #3a4a3e;
  background: #ffffff;
  box-shadow: 0 4px 24px rgba(0,0,0,.09);
}

/* ══ محور Y ══════════════════════════════════════════════════════════════════ */
.y-axis { width: 72px; flex-shrink: 0; position: relative; height: 620px; background: #f7f5f0; }
.y-axis--left  { border-left: 2.5px solid #3a4a3e; border-right: 1px solid #dedad2; }
.y-axis--right { border-right: 2.5px solid #3a4a3e; border-left: 1px solid #dedad2; }

.y-tick {
  position: absolute;
  font-size: 11px;
  font-family: monospace;
  font-weight: 600;
  color: #3a4a3e;
  transform: translateY(-50%);
  white-space: nowrap;
}
.y-axis--left  .y-tick { right: 10px; }
.y-axis--right .y-tick { left: 10px; }
.y-axis--left  .y-tick::after  { content:''; position:absolute; left:100%; top:50%; width:6px; height:1px; background:#3a4a3e; margin-left:2px; }
.y-axis--right .y-tick::before { content:''; position:absolute; right:100%; top:50%; width:6px; height:1px; background:#3a4a3e; margin-right:2px; }

/* ══ plot-area ═══════════════════════════════════════════════════════════════ */
.plot-area { flex: 1; position: relative; overflow: hidden; }
.grid-svg, .corr-svg { position: absolute; top:0; left:0; pointer-events: none; }
.grid-svg { z-index: 1; }
.corr-svg { z-index: 3; }

.datum-line {
  position: absolute; left:0; right:0;
  border-top: 2px dashed #2196f3;
  z-index: 4; pointer-events: none;
}

/* ══ ستون چاه ════════════════════════════════════════════════════════════════ */
.well-col { position: absolute; top:0; height:100%; z-index:2; }

.fm-block {
  position: absolute; left:0; right:0;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer;
  transition: opacity .2s, filter .2s, box-shadow .2s;
  z-index: 2;
}
.fm-block--dim { opacity: .1; pointer-events: none; }
.fm-block:not(.fm-block--dim):hover {
  filter: brightness(1.08) saturate(1.1);
  z-index: 10;
  box-shadow: 0 0 0 2.5px rgba(0,0,0,.3), inset 0 0 16px rgba(255,255,255,.25);
}

.fm-block__label {
  font-size: 12.5px; font-weight: 800;
  color: #1a1a1a;
  text-shadow: 0 1px 3px rgba(255,255,255,.75);
  pointer-events: none; user-select: none;
}

/* اعداد عمق */
.depth-num {
  position: absolute;
  font-size: 10px;
  font-family: monospace;
  font-weight: 700;
  color: #2e3e32;
  right: calc(100% + 4px);
  white-space: nowrap;
  pointer-events: none;
  transform: translateY(-50%);
  background: rgba(255,255,255,.7);
  padding: 0 2px;
  border-radius: 2px;
}

/* TD */
.td-mark { position: absolute; left:0; right:0; border-top: 3px solid #1e2a22; z-index:6; }
.td-mark::after {
  content: 'TD';
  position: absolute; right: calc(100% + 3px); top: -8px;
  font-size: 8.5px; font-family: monospace; font-weight: 700; color: #1e2a22;
}

/* ══ محور X ══════════════════════════════════════════════════════════════════ */
.x-axis-row { display: flex; align-items: flex-start; margin-top: 0; }
.x-axis { border-top: 2.5px solid #3a4a3e; padding-top: 4px; }
.x-ticks { display: flex; justify-content: space-between; }
.x-tick { font-size: 10.5px; font-family: monospace; font-weight: 600; color: #3a4a3e; }
.x-label { text-align: center; font-size: 12px; font-weight: 700; color: #3a4a3e; margin-top: 4px; }

/* ══ پانل‌های پایین — وسط‌چین ════════════════════════════════════════════════ */
.bottom-panels {
  display: flex;
  gap: 20px;
  margin-top: 24px;
  flex-wrap: wrap;
  justify-content: center;   /* ← وسط‌چین */
  align-items: flex-start;
}

.panel {
  background: #ffffff;
  border: 1.5px solid #d4cfc6;
  border-radius: 10px;
  overflow: hidden;
  box-shadow: 0 2px 12px rgba(0,0,0,.07);
}
.panel__title {
  font-size: 12px; font-weight: 800;
  color: #1e2a22;
  background: #eae6de;
  padding: 8px 16px;
  text-align: center;
  border-bottom: 1.5px solid #d4cfc6;
}

/* راهنما */
.legend-panel { min-width: 210px; }
.legend-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 16px;
  border-bottom: 1px solid #f0ece4;
  font-size: 12px;
}
.legend-row:last-child { border-bottom: none; }
.legend-swatch { width: 30px; height: 16px; border-radius: 4px; border: 1px solid rgba(0,0,0,.12); flex-shrink: 0; }
.legend-en { font-family: monospace; font-size: 11px; color: #5a6a60; flex: 1; }
.legend-fa { font-weight: 700; color: #1e2a22; }

/* جدول ضخامت */
.thickness-panel { min-width: 260px; }
.t-table { width: 100%; border-collapse: collapse; font-size: 13px; direction: rtl; }
.t-table th,
.t-table td { border: 1px solid #e0dbd2; padding: 7px 14px; text-align: center; }
.t-table thead th {
  background: #f0ece4;
  font-weight: 800;
  color: #1e2a22;
  font-size: 12.5px;
}
.td-fm { text-align: right !important; font-weight: 700; color: #1e2a22; }
.td-num {
  font-family: monospace;
  font-size: 13.5px;
  font-weight: 700;
  color: #2e4a38;
  letter-spacing: .02em;
}
.t-dot { display: inline-block; width: 11px; height: 11px; border-radius: 50%; margin-left: 6px; vertical-align: middle; }

/* توضیحات */
.notes-panel { min-width: 230px; }
.note-row {
  display: flex; align-items: center; gap: 10px;
  padding: 7px 16px;
  border-bottom: 1px solid #f0ece4;
  font-size: 12px; color: #3a4a3e;
}
.note-row:last-of-type { border-bottom: none; }
.note-line { font-family: monospace; font-size: 15px; letter-spacing: 2px; color: #4a5a50; }
.note-line--blue { color: #2196f3; }
.note-small { padding: 6px 16px 10px; font-size: 10.5px; color: #7a8a80; }

/* ══ پاپ‌آپ ══════════════════════════════════════════════════════════════════ */
.fm-popup {
  position: fixed; z-index: 9999;
  width: 240px;
  background: #fff;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0,0,0,.20), 0 2px 8px rgba(0,0,0,.10), 0 0 0 1px rgba(0,0,0,.05);
  pointer-events: none;
}
.fm-popup__header {
  display: flex; align-items: center; gap: 10px;
  padding: 12px 14px; color: #fff;
}
.fm-popup__icon  { font-size: 20px; flex-shrink: 0; }
.fm-popup__name  { font-size: 14px; font-weight: 900; text-shadow: 0 1px 3px rgba(0,0,0,.25); }
.fm-popup__well  { font-size: 10px; opacity: .85; margin-top: 2px; }

.fm-popup__body { padding: 6px 0 2px; }
.fm-popup__row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 7px 16px;
  border-bottom: 1px solid #f2efe8;
}
.fm-popup__row:last-child { border-bottom: none; }
.fm-popup__row--hl { background: #f7f4ee; }
.fm-popup__key { font-size: 11.5px; color: #7a8a80; font-weight: 600; }
.fm-popup__val { font-size: 12.5px; color: #1e2a22; font-family: monospace; font-weight: 600; }
.fm-popup__val--bold { font-weight: 900; font-size: 14px; color: #1e6a44; }

/* ══ انیمیشن ══════════════════════════════════════════════════════════════════ */
.popup-enter-active { transition: opacity .15s ease, transform .15s ease; }
.popup-leave-active { transition: opacity .10s ease, transform .10s ease; }
.popup-enter-from   { opacity: 0; transform: translateY(6px) scale(.97); }
.popup-leave-to     { opacity: 0; transform: translateY(4px) scale(.98); }
</style>
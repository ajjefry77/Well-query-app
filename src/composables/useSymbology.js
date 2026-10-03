// =====================================================
// Symbology — موتور سیمبولوژی به سبک ArcGIS Pro
// rendererها: single | unique | graduated | unclassed |
//             graduated-sym | proportional | heatmap | dot
// متدهای طبقه‌بندی: equal | quantile | jenks | stddev | manual
// =====================================================
import { ref, watch } from 'vue'

const LS_KEY = 'wqa:symbology:v1'

// ---------- رامپ‌های رنگی ----------
export const COLOR_RAMPS = [
  { id: 'spectral', name: 'طیفی (Spectral)', kind: 'diverging', stops: ['#9e0142', '#d53e4f', '#f46d43', '#fdae61', '#fee08b', '#e6f598', '#abdda4', '#66c2a5', '#3288bd', '#5e4fa2'] },
  { id: 'rdylgn', name: 'قرمز-زرد-سبز', kind: 'diverging', stops: ['#d73027', '#f46d43', '#fdae61', '#fee08b', '#d9ef8b', '#a6d96a', '#66bd63', '#1a9850'] },
  { id: 'coolwarm', name: 'سرد-گرم', kind: 'diverging', stops: ['#3b4cc0', '#6687ed', '#9bb6f5', '#dddffa', '#fdd8d8', '#f5a3a3', '#ed6660', '#b40426'] },
  { id: 'ylorrd', name: 'زرد-نارنجی-قرمز', kind: 'sequential', stops: ['#ffffcc', '#ffeda0', '#fed976', '#feb24c', '#fd8d3c', '#fc4e2a', '#e31a1c', '#800026'] },
  { id: 'blues', name: 'آبی‌ها', kind: 'sequential', stops: ['#f7fbff', '#deebf7', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#08306b'] },
  { id: 'greens', name: 'سبزها', kind: 'sequential', stops: ['#f7fcf5', '#e5f5e0', '#c7e9c0', '#a1d99b', '#74c476', '#41ab5d', '#238b45', '#005a32'] },
  { id: 'reds', name: 'قرمزها', kind: 'sequential', stops: ['#fff5f0', '#fee5d9', '#fcbba1', '#fc9272', '#fb6a4a', '#ef3b2c', '#cb181d', '#67000d'] },
  { id: 'oranges', name: 'نارنجی‌ها', kind: 'sequential', stops: ['#fff5eb', '#fee6ce', '#fdd0a2', '#fdae6b', '#fd8d3c', '#f16913', '#d94801', '#7f2704'] },
  { id: 'purples', name: 'بنفش‌ها', kind: 'sequential', stops: ['#fcfbfd', '#efedf5', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#3f007d'] },
  { id: 'viridis', name: 'ویریدیس', kind: 'sequential', stops: ['#440154', '#482878', '#3e4989', '#31688e', '#26828e', '#1f9e89', '#35b779', '#6ece58', '#b5de2b', '#fde725'] },
  { id: 'turbo', name: 'توربو', kind: 'sequential', stops: ['#30123b', '#4145ab', '#4675ed', '#39a2fb', '#1bcfd4', '#24eca6', '#61fc6c', '#a4fc3b', '#d1e834', '#faba39', '#fb7e1f', '#e4460a', '#7a0403'] },
  { id: 'grays', name: 'خاکستری', kind: 'sequential', stops: ['#ffffff', '#f0f0f0', '#d9d9d9', '#bdbdbd', '#969696', '#737373', '#525252', '#252525'] },
  { id: 'inferno', name: 'اینفرنو (Inferno)', kind: 'sequential', stops: ['#000004', '#1f0c48', '#420a68', '#6a176e', '#932667', '#bb3654', '#dd513a', '#f3771a', '#fca50a', '#fcffa4'] },
  { id: 'magma', name: 'ماگما (Magma)', kind: 'sequential', stops: ['#000004', '#180f3d', '#440f76', '#721f81', '#9e2b83', '#cd443d', '#f1605d', '#fd9668', '#feca8d', '#fcfdbf'] },
  { id: 'plasma', name: 'پلاسما (Plasma)', kind: 'sequential', stops: ['#0d0887', '#41049d', '#6a00a8', '#8f0da4', '#b12a90', '#cc4778', '#e16462', '#f2844b', '#fca636', '#fcce25', '#f0f921'] },
  { id: 'cividis', name: 'سیویدیس (Cividis)', kind: 'sequential', stops: ['#00224e', '#1f4e79', '#575c6d', '#7e7e78', '#a59c74', '#d1b26f', '#fee838'] },
  { id: 'jet', name: 'جت (Jet)', kind: 'sequential', stops: ['#00008f', '#0020ff', '#00cfff', '#00ff88', '#7fff00', '#ffff00', '#ff7f00', '#ff0000', '#7f0000'] },
  { id: 'hot', name: 'داغ (Hot)', kind: 'sequential', stops: ['#000000', '#330000', '#7a0000', '#cc0000', '#ff3300', '#ff6600', '#ff9900', '#ffcc00', '#ffff00', '#ffffff'] },
  { id: 'gistheat', name: 'آتش (Fire)', kind: 'sequential', stops: ['#000000', '#400000', '#800000', '#c00000', '#ff4000', '#ff8000', '#ffbf00', '#ffff00', '#ffffff'] },
  { id: 'cool', name: 'خنک (Cool)', kind: 'sequential', stops: ['#00ffff', '#00ccff', '#0099ff', '#0066ff', '#0033ff', '#0000ff', '#7a00ff', '#cc00ff', '#ff00ff'] },
  { id: 'rainbow', name: 'رنگین‌کمان', kind: 'sequential', stops: ['#ff0000', '#ff7f00', '#ffff00', '#00e676', '#00b0ff', '#3d5afe', '#9400d3'] },
  { id: 'ocean', name: 'اقیانوس', kind: 'sequential', stops: ['#000080', '#0000cd', '#0077be', '#00a9e0', '#33c4b8', '#7fd4c1', '#caf0e6'] },
  { id: 'terrain', name: 'زمین (Terrain)', kind: 'sequential', stops: ['#333399', '#47906a', '#66cc99', '#b8c95e', '#cc9966', '#996633', '#663300'] },
  { id: 'copper', name: 'مسی', kind: 'sequential', stops: ['#000000', '#1a0d00', '#4d2600', '#805500', '#a86e00', '#cc8f33', '#e6b866', '#ffe6b3'] },
  { id: 'bone', name: 'استخوانی', kind: 'sequential', stops: ['#000000', '#2b2b40', '#55556e', '#808099', '#adadc2', '#d9d9e2', '#ffffff'] },
  { id: 'spring', name: 'بهاری', kind: 'sequential', stops: ['#ff00aa', '#ff55aa', '#ff9955', '#ffdd00', '#ffff00'] },
  { id: 'summer', name: 'تابستانی', kind: 'sequential', stops: ['#00664d', '#1a9850', '#66bd63', '#a6d96a', '#d9ef8b', '#ffff00'] },
  { id: 'autumn', name: 'پاییزی', kind: 'sequential', stops: ['#7f0000', '#cc0000', '#ff5500', '#ff9900', '#ffcc00', '#ffff00'] },
  { id: 'winter', name: 'زمستانی', kind: 'sequential', stops: ['#00008f', '#0028ff', '#0078ff', '#00c8ff', '#a8f0ff', '#ffffff'] },
  { id: 'ylgnbu', name: 'زرد-سبز-آبی', kind: 'sequential', stops: ['#ffffd9', '#c7e9b4', '#7fcdbb', '#41b6c4', '#2c7fb0', '#253494', '#081d58'] },
  { id: 'gnbu', name: 'سبز-آبی', kind: 'sequential', stops: ['#f7fbff', '#c6dbef', '#9ecae1', '#6baed6', '#4292c6', '#2171b5', '#084594'] },
  { id: 'bupu', name: 'آبی-بنفش', kind: 'sequential', stops: ['#fcfbfd', '#dadaeb', '#bcbddc', '#9e9ac8', '#807dba', '#6a51a3', '#3f007d'] },
  { id: 'rdpu', name: 'قرمز-بنفش', kind: 'sequential', stops: ['#fff7f3', '#fde0dd', '#fcc5c0', '#fa9fb5', '#f768a1', '#c51b7d', '#49006a'] },
  { id: 'orrd', name: 'نارنجی-قرمز', kind: 'sequential', stops: ['#fff7ec', '#fee8c8', '#fdd49e', '#fdbb84', '#fc8d59', '#e34a33', '#7f0000'] },
  { id: 'ylgn', name: 'زرد-سبز', kind: 'sequential', stops: ['#ffffe5', '#d9f0a3', '#addd8e', '#78c679', '#41ab5d', '#238443', '#004529'] },
  { id: 'ylorbr', name: 'زرد-قهوه‌ای', kind: 'sequential', stops: ['#ffffe5', '#fee391', '#fec44f', '#fe9929', '#ec7014', '#993404', '#662506'] },
  { id: 'bugn', name: 'آبی-سبز', kind: 'sequential', stops: ['#f7fcfd', '#ccece6', '#99d8c9', '#66c2a4', '#41ae76', '#238b45', '#00441b'] },
  { id: 'rdbu', name: 'قرمز-آبی (واگرا)', kind: 'diverging', stops: ['#67001f', '#b2182b', '#d6604d', '#f4a582', '#fddbc7', '#f7f7f7', '#d1e9f1', '#92c5de', '#4393c3', '#2166ac', '#053061'] },
  { id: 'piyg', name: 'صورتی-سبز (واگرا)', kind: 'diverging', stops: ['#c51b7d', '#de77ae', '#f1b6da', '#fde0ef', '#f7f7f7', '#e6f5d0', '#b8e186', '#7fbc41', '#4d9221'] },
  { id: 'brbg', name: 'قهوه‌ای-سبز (واگرا)', kind: 'diverging', stops: ['#543005', '#8c510a', '#bf812d', '#dfc27d', '#f6e8c3', '#c7eae5', '#80cdc1', '#35978f', '#01665e', '#003c30'] },
  { id: 'puor', name: 'بنفش-نارنجی (واگرا)', kind: 'diverging', stops: ['#7f3b08', '#b35806', '#e08214', '#fdb863', '#fee0b6', '#d8daeb', '#b2abd2', '#8073ac', '#542788', '#2d004b'] },
  // رامپ‌های مقوله‌ای (برای Unique Values)
  { id: 'category10', name: 'مقوله‌ای ۱۰ رنگ', kind: 'categorical', stops: ['#1f77b4', '#ff7f0e', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#7f7f7f', '#bcbd22', '#17becf'] },
  { id: 'pastel', name: 'پاستلی', kind: 'categorical', stops: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a'] },
  { id: 'set3', name: 'ست ۳', kind: 'categorical', stops: ['#8dd3c7', '#ffffb3', '#bebada', '#fb8072', '#80b1d3', '#fdb462', '#b3de69', '#fccde5', '#d9d9d9', '#bc80bd'] },
  { id: 'dark2', name: 'تیره ۲', kind: 'categorical', stops: ['#1b9e77', '#d95f02', '#7570b3', '#e7298a', '#66a61e', '#e6ab02', '#a6761d', '#666666'] },
  { id: 'tableau10', name: 'تابلو ۱۰', kind: 'categorical', stops: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac'] },
  { id: 'tableau20', name: 'تابلو ۲۰', kind: 'categorical', stops: ['#4e79a7', '#a0cbe8', '#f28e2b', '#ffbe7d', '#59a14f', '#8cd17d', '#b6992d', '#f1ce63', '#499894', '#86bcb6', '#e15759', '#ff9d9a', '#79706e', '#bab0ac', '#d37295', '#fabfd2', '#b07aa1', '#d4a6c8', '#9d7660', '#d7b5a6'] },
  { id: 'set1', name: 'ست ۱', kind: 'categorical', stops: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffe135', '#a65628', '#f781bf', '#999999'] },
  { id: 'set2', name: 'ست ۲', kind: 'categorical', stops: ['#66c2a5', '#fc8d62', '#8da0cb', '#e78ac3', '#a6d854', '#ffd92f', '#e5c494', '#b3b3b3'] },
  { id: 'paired', name: 'جفتی (Paired)', kind: 'categorical', stops: ['#a6cee3', '#1f78b4', '#b2df8a', '#33a02c', '#fb9a99', '#e31a1c', '#fdbf6f', '#ff7f00', '#cab2d6', '#6a3d9a', '#ffff99', '#b15928'] },
  { id: 'accent', name: 'تاکیدی (Accent)', kind: 'categorical', stops: ['#7fc97f', '#beaed4', '#fdc086', '#ffff99', '#386cb0', '#f0027f', '#bf5b17', '#666666'] },
  { id: 'okabeito', name: 'اوکابه-ایتو', kind: 'categorical', stops: ['#e69f00', '#56b4e9', '#009e73', '#f0e442', '#0072b2', '#d55e00', '#cc79a7', '#999999'] },
  { id: 'plotly', name: 'پلاتلی', kind: 'categorical', stops: ['#636efa', '#ef553b', '#00cc96', '#ab63fa', '#ffa15a', '#19d3f3', '#ff6692', '#b6e880', '#ff97ff', '#fecb52'] },
  { id: 'd3cat20', name: 'دی‌تری ۲۰', kind: 'categorical', stops: ['#1f77b4', '#aec7e8', '#ff7f0e', '#ffbb78', '#2ca02c', '#98df8a', '#d62728', '#ff9896', '#9467bd', '#c5b0d5', '#8c564b', '#c49c94', '#e377c2', '#f7b6d2', '#7f7f7f', '#c7c7c7', '#bcbd22', '#dbdb8d', '#17becf', '#9edae5'] },
  { id: 'pastel2', name: 'پاستلی ۲', kind: 'categorical', stops: ['#b3e2cd', '#fdcdac', '#cbd5e8', '#f4cae4', '#e6f5c9', '#fff2ae', '#f1e2cc', '#cccccc'] },
  { id: 'neon', name: 'نئونی', kind: 'categorical', stops: ['#ff2e63', '#08d9d6', '#f9ed69', '#b83b5e', '#6a2c70', '#00e676', '#ff9800', '#3d5afe', '#00e5ff', '#c6ff00'] },
  { id: 'earth', name: 'زمینی', kind: 'categorical', stops: ['#5d4037', '#8d6e63', '#a1887f', '#2e7d32', '#66bb6a', '#0288d1', '#f9a825', '#ef6c00', '#c62828', '#6a1b9a'] },
  // رامپ‌های کم‌طیف (برای لایه‌های با کلاس/مقدار کم: ۳ تا ۷ رنگ)
  { id: 'mini3', name: 'سه‌رنگی اصلی', kind: 'categorical', stops: ['#e41a1c', '#377eb8', '#4daf4a'] },
  { id: 'mini4', name: 'چهاررنگی اصلی', kind: 'categorical', stops: ['#e41a1c', '#377eb8', '#4daf4a', '#ff7f00'] },
  { id: 'mini5', name: 'پنج‌رنگی اصلی', kind: 'categorical', stops: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00'] },
  { id: 'mini6', name: 'شش‌رنگی اصلی', kind: 'categorical', stops: ['#e41a1c', '#377eb8', '#4daf4a', '#984ea3', '#ff7f00', '#ffe135'] },
  { id: 'pastelmini3', name: 'پاستلی سه‌رنگی', kind: 'categorical', stops: ['#a6cee3', '#b2df8a', '#fb9a99'] },
  { id: 'pastelmini5', name: 'پاستلی پنج‌رنگی', kind: 'categorical', stops: ['#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f', '#cab2d6'] },
  { id: 'pastelmini7', name: 'پاستلی هفت‌رنگی', kind: 'categorical', stops: ['#a6cee3', '#b2df8a', '#fb9a99', '#fdbf6f', '#cab2d6', '#ffff99', '#e5c494'] },
  { id: 'warm3', name: 'گرم سه‌رنگی', kind: 'categorical', stops: ['#d73027', '#fc8d59', '#fee090'] },
  { id: 'warm5', name: 'گرم پنج‌رنگی', kind: 'categorical', stops: ['#a50026', '#d73027', '#fc8d59', '#fee090', '#ffffbf'] },
  { id: 'cool3', name: 'سرد سه‌رنگی', kind: 'categorical', stops: ['#313695', '#74add1', '#e0f3f8'] },
  { id: 'cool5', name: 'سرد پنج‌رنگی', kind: 'categorical', stops: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8'] },
  { id: 'safe3', name: 'ایمن سه‌رنگی (کوررنگی)', kind: 'categorical', stops: ['#0072b2', '#e69f00', '#009e73'] },
  { id: 'safe5', name: 'ایمن پنج‌رنگی (کوررنگی)', kind: 'categorical', stops: ['#0072b2', '#e69f00', '#009e73', '#cc79a7', '#d55e00'] },
]

export const RENDERERS = [
  { id: 'single', name: 'تک‌نماد (Single Symbol)', desc: 'یک نماد واحد برای همه عارضه‌ها', needsField: false },
  { id: 'unique', name: 'مقادیر یکتا (Unique Values)', desc: 'رنگ/نماد مجزا برای هر مقدار متمایز', needsField: true, fieldType: 'any' },
  { id: 'graduated', name: 'رنگ‌های مدرج (Graduated Colors)', desc: 'طیف رنگی بر اساس بازه‌های عددی', needsField: true, fieldType: 'number' },
  { id: 'unclassed', name: 'رنگ پیوسته (Unclassed Colors)', desc: 'گرادیان پیوسته بدون کلاس‌بندی', needsField: true, fieldType: 'number' },
  { id: 'graduated-sym', name: 'نمادهای مدرج (Graduated Symbols)', desc: 'اندازه نماد در چند کلاس عددی', needsField: true, fieldType: 'number' },
  { id: 'proportional', name: 'نماد متناسب (Proportional Symbols)', desc: 'اندازه پیوسته متناسب با مقدار', needsField: true, fieldType: 'number' },
  { id: 'heatmap', name: 'نقشه حرارتی (Heat Map)', desc: 'تراکم نقطه‌ای — فقط لایه نقطه‌ای', needsField: false, pointsOnly: true },
  { id: 'dot', name: 'تراکم نقطه‌ای (Dot Density)', desc: 'نقطه‌گذاری تصادفی داخل پلیگان', needsField: false, polygonsOnly: true },
]

export const CLASS_METHODS = [
  { id: 'equal', name: 'فواصل مساوی (Equal Interval)' },
  { id: 'quantile', name: 'چندک (Quantile)' },
  { id: 'jenks', name: 'شکست طبیعی جنکس (Natural Breaks)' },
  { id: 'stddev', name: 'انحراف معیار (Std. Deviation)' },
  { id: 'manual', name: 'دستی (Manual)' },
]

// ---------- ابزار رنگ ----------
function hexToRgb(hex) {
  const m = String(hex ?? '').trim().match(/^#?([0-9a-f]{6}|[0-9a-f]{3})$/i)
  if (!m) return { r: 128, g: 128, b: 128 }
  let h = m[1]
  if (h.length === 3) h = h.split('').map(c => c + c).join('')
  const n = parseInt(h, 16)
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}
function rgbToHex(r, g, b) {
  const c = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')
  return `#${c(r)}${c(g)}${c(b)}`
}
export function rampStops(rampId) {
  return (COLOR_RAMPS.find(r => r.id === rampId) ?? COLOR_RAMPS[0]).stops
}
export function sampleRamp(rampId, n, reversed = false) {
  const stops = [...rampStops(rampId)]
  if (reversed) stops.reverse()
  if (n <= 0) return []
  if (n === 1) return [stops[Math.floor(stops.length / 2)] ?? stops[0]]
  if (stops.length === n) return stops
  const out = []
  for (let i = 0; i < n; i++) {
    const t = i / (n - 1)
    const pos = t * (stops.length - 1)
    const i0 = Math.floor(pos), i1 = Math.min(stops.length - 1, i0 + 1)
    const f = pos - i0
    const a = hexToRgb(stops[i0]), b = hexToRgb(stops[i1])
    out.push(rgbToHex(a.r + (b.r - a.r) * f, a.g + (b.g - a.g) * f, a.b + (b.b - a.b) * f))
  }
  return out
}
export function hexToRgba(hex, alpha = 1) {
  const { r, g, b } = hexToRgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

// ---------- آمار و طبقه‌بندی ----------
export function numericValues(rows, field) {
  const out = []
  for (const r of rows ?? []) {
    const v = Number(r?.[field])
    if (Number.isFinite(v)) out.push(v)
  }
  return out.sort((a, b) => a - b)
}
function equalBreaks(sorted, n) {
  if (!sorted.length) return []
  const min = sorted[0], max = sorted[sorted.length - 1]
  if (min === max) return [min, max]
  const step = (max - min) / n
  const b = [min]
  for (let i = 1; i < n; i++) b.push(min + step * i)
  b.push(max)
  return b
}
function quantileBreaks(sorted, n) {
  if (!sorted.length) return []
  const b = [sorted[0]]
  for (let i = 1; i < n; i++) {
    const pos = (sorted.length - 1) * (i / n)
    const lo = Math.floor(pos), hi = Math.ceil(pos)
    b.push(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo))
  }
  b.push(sorted[sorted.length - 1])
  return b
}
// جنکس — الگوریتم کانونیک Jenks-Caspall (برای > 20k مقدار نمونه‌برداری می‌شود)
function jenksMatrices(data, n) {
  const lower = [], variance = []
  for (let i = 0; i < data.length + 1; i++) {
    lower.push(new Array(n + 1).fill(0))
    variance.push(new Array(n + 1).fill(0))
  }
  for (let i = 1; i < n + 1; i++) {
    lower[0][i] = 1
    variance[0][i] = 0
    for (let j = 2; j < data.length + 1; j++) variance[j][i] = Infinity
  }
  for (let l = 2; l < data.length + 1; l++) {
    let s1 = 0, s2 = 0, w = 0, v = 0
    for (let m = 1; m < l + 1; m++) {
      const i3 = l - m + 1
      const val = data[i3 - 1]
      s2 += val * val; s1 += val; w++
      v = s2 - (s1 * s1) / w
      const i4 = i3 - 1
      if (i4 !== 0) {
        for (let j = 2; j < n + 1; j++) {
          if (variance[l][j] >= v + variance[i4][j - 1]) {
            lower[l][j] = i3
            variance[l][j] = v + variance[i4][j - 1]
          }
        }
      }
    }
    lower[l][1] = 1
    variance[l][1] = v
  }
  return lower
}
function jenksBreaks(sorted, n) {
  const data = sorted.length > 20000
    ? sorted.filter((_, i) => i % Math.ceil(sorted.length / 20000) === 0)
    : sorted
  const m = data.length
  if (!m) return []
  if (n >= m) {
    const b = [...new Set(data)].sort((a, b) => a - b)
    if (b.length === 1) return [b[0], b[0]]
    return b
  }
  const lower = jenksMatrices(data, n)
  const breaks = new Array(n + 1)
  breaks[n] = data[m - 1]
  breaks[0] = data[0]
  let k = m, count = n
  while (count > 1) {
    const idx = (lower[k][count] ?? 2) - 2
    breaks[count - 1] = data[Math.max(0, Math.min(m - 1, idx))]
    k = Math.max(1, (lower[k][count] ?? 2) - 1)
    count--
  }
  // یکتا و مرتب + تضمین صعودی اکید
  const uniq = [...new Set(breaks)].sort((a, b) => a - b)
  if (uniq.length < 2) return [data[0], data[m - 1]]
  for (let i = 1; i < uniq.length; i++) {
    if (uniq[i] <= uniq[i - 1]) uniq[i] = uniq[i - 1] + 1e-9
  }
  return uniq
}
function stddevBreaks(sorted, n) {
  if (!sorted.length) return []
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length
  const sd = Math.sqrt(sorted.reduce((s, v) => s + (v - mean) ** 2, 0) / sorted.length)
  if (!Number.isFinite(sd) || sd === 0) return [sorted[0], sorted[sorted.length - 1]]
  // بازه‌های ±kσ حول میانگین، برش‌خورده به [min,max]
  const min = sorted[0], max = sorted[sorted.length - 1]
  const half = Math.floor(n / 2)
  const raw = []
  for (let i = -half; i <= n - half; i++) raw.push(mean + i * sd)
  const b = [min, ...raw.filter(v => v > min && v < max), max]
  return [...new Set(b)].sort((a, b) => a - b)
}
export function classifyBreaks(sortedValues, method, numClasses, manualBreaks = []) {
  const n = Math.max(2, Math.min(9, Math.round(numClasses) || 5))
  if (!sortedValues.length) return []
  if (method === 'manual' && manualBreaks?.length >= 2) {
    return [...new Set(manualBreaks.map(Number).filter(Number.isFinite))].sort((a, b) => a - b)
  }
  if (method === 'quantile') return quantileBreaks(sortedValues, n)
  if (method === 'jenks') return jenksBreaks(sortedValues, n)
  if (method === 'stddev') return stddevBreaks(sortedValues, n)
  return equalBreaks(sortedValues, n)
}
function fmtNum(v, digits = 3) {
  if (!Number.isFinite(v)) return '—'
  const a = Math.abs(v)
  if (a !== 0 && (a >= 1e9 || a < 1e-4)) return v.toExponential(2)
  return String(Math.round(v * 10 ** digits) / 10 ** digits)
}
export function classLabel(min, max, isFirst, isLast) {
  void isFirst; void isLast
  return `${fmtNum(min)} – ${fmtNum(max)}`
}

// ---------- کانفیگ پیش‌فرض ----------
export function defaultSymbology(uuid, geomKind = 'point', fallbackColor = '#0f5c7e') {
  return {
    uuid,
    renderer: 'single',
    field: null,
    normField: null,
    method: 'jenks',
    numClasses: 5,
    colorRamp: geomKind === 'point' ? 'ylorrd' : 'spectral',
    reversed: false,
    manualBreaks: [],
    classes: [],          // ساخته‌شده: [{min,max,label,color,size,count}]
    uniqueValues: [],     // [{value,label,color,count}]
    uniqueLimit: 30,
    showOther: true,
    otherColor: '#bfbfbf',
    single: {
      color: fallbackColor,
      strokeColor: geomKind === 'point' ? '#ffffff' : fallbackColor,
      strokeWidth: geomKind === 'point' ? 2 : 1.5,
      size: geomKind === 'point' ? 7 : 2.5,
      fillOpacity: 0.55,
      opacity: 1,
      shape: 'circle',
      dash: 'solid',
    },
    gradSym: { minSize: 4, maxSize: 18, color: fallbackColor, strokeColor: '#ffffff', strokeWidth: 1.5 },
    prop: { minSize: 4, maxSize: 22, minValue: null, maxValue: null, color: fallbackColor, strokeColor: '#ffffff' },
    heat: { radius: 30, intensity: 0.6, opacity: 0.85, ramp: 'turbo' },
    dot: { value: 1, size: 2.5, color: '#1a1a1a', opacity: 0.85 },
    transparency: 0, // ۰ تا ۱۰۰ مثل ArcGIS
  }
}

// ---------- استور ----------
function lsLoad() {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const obj = raw ? JSON.parse(raw) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch { return {} }
}
export function useSymbology() {
  const configs = ref(lsLoad())
  watch(configs, (v) => {
    try { localStorage.setItem(LS_KEY, JSON.stringify(v)) } catch {}
  }, { deep: true })

  function getConfig(uuid, geomKind = 'point', fallbackColor = '#0f5c7e') {
    if (!configs.value[uuid]) {
      configs.value[uuid] = defaultSymbology(uuid, geomKind, fallbackColor)
    } else {
      configs.value[uuid].uuid = uuid
    }
    return configs.value[uuid]
  }
  function setConfig(uuid, cfg) {
    configs.value[uuid] = { ...cfg, uuid }
  }
  function resetConfig(uuid, geomKind = 'point', fallbackColor = '#0f5c7e') {
    configs.value[uuid] = defaultSymbology(uuid, geomKind, fallbackColor)
  }
  function removeConfig(uuid) {
    delete configs.value[uuid]
  }
  function clearAll() {
    configs.value = {}
  }
  function hasCustom(uuid) {
    const c = configs.value[uuid]
    return !!c && c.renderer !== 'single'
  }
  return { configs, getConfig, setConfig, resetConfig, removeConfig, clearAll, hasCustom }
}

// ---------- ساخت کلاس‌ها / مقادیر یکتا ----------
export function buildGraduatedClasses(rows, cfg) {
  const vals = numericValues(rows, cfg.field)
  if (!vals.length || !cfg.field) return []
  const breaks = classifyBreaks(vals, cfg.method, cfg.numClasses, cfg.manualBreaks)
  if (breaks.length < 2) return []
  const n = breaks.length - 1
  const colors = sampleRamp(cfg.colorRamp, n, cfg.reversed)
  const sizes = cfg.renderer === 'graduated-sym'
    ? Array.from({ length: n }, (_, i) => cfg.gradSym.minSize + ((cfg.gradSym.maxSize - cfg.gradSym.minSize) * i) / Math.max(1, n - 1))
    : null
  const out = []
  for (let i = 0; i < n; i++) {
    const min = breaks[i], max = breaks[i + 1]
    let count = 0
    for (const v of vals) {
      if (v < min || v > max) continue
      if (v === min && i > 0) continue // مرز پایین فقط برای کلاس اول
      count++
    }
    out.push({
      min, max,
      label: classLabel(min, max, i === 0, i === n - 1),
      color: colors[i],
      size: sizes ? Math.round(sizes[i] * 10) / 10 : null,
      count,
    })
  }
  return out
}
export function buildUniqueValues(rows, cfg) {
  if (!cfg.field) return []
  const freq = new Map()
  for (const r of rows ?? []) {
    const v = r?.[cfg.field]
    const k = v === null || v === undefined || v === '' ? '(خالی)' : String(v)
    freq.set(k, (freq.get(k) ?? 0) + 1)
  }
  const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1])
  const limit = Math.max(5, Math.min(100, cfg.uniqueLimit || 30))
  const top = sorted.slice(0, limit)
  // همیشه از رامپ انتخاب‌شده استفاده کن تا تغییر رامپ در «افزودن همه مقادیر» هم اثر کند
  const colors = sampleRamp(cfg.colorRamp || 'category10', top.length, cfg.reversed)
  return top.map(([value, count], i) => ({ value, label: value, color: colors[i], count }))
}

// ---------- رزولوشن استایل یک عارضه ----------
export function valueForNorm(row, cfg) {
  const v = Number(row?.[cfg.field])
  if (!Number.isFinite(v)) return NaN
  if (cfg.normField) {
    const d = Number(row?.[cfg.normField])
    if (!Number.isFinite(d) || d === 0) return NaN
    return v / d
  }
  return v
}
export function resolveFeatureStyle(row, cfg, geomKind = 'point') {
  const t = 1 - Math.max(0, Math.min(100, cfg.transparency || 0)) / 100
  const single = cfg.single || {}
  const base = {
    color: single.color ?? '#0f5c7e',
    strokeColor: single.strokeColor ?? '#ffffff',
    strokeWidth: single.strokeWidth ?? (geomKind === 'point' ? 2 : 1.5),
    size: single.size ?? (geomKind === 'point' ? 7 : 2.5),
    fillOpacity: (single.fillOpacity ?? 0.55) * t,
    opacity: (single.opacity ?? 1) * t,
    shape: single.shape ?? 'circle',
    dash: single.dash ?? 'solid',
  }
  const r = cfg.renderer || 'single'
  if (r === 'unique' && cfg.field) {
    const raw = row?.[cfg.field]
    const k = raw === null || raw === undefined || raw === '' ? '(خالی)' : String(raw)
    const hit = (cfg.uniqueValues || []).find(u => String(u.value) === k)
    if (hit) return { ...base, color: hit.color }
    if (cfg.showOther) return { ...base, color: cfg.otherColor || '#bfbfbf' }
    return { ...base, color: base.color, opacity: 0, fillOpacity: 0 }
  }
  if ((r === 'graduated' || r === 'graduated-sym') && cfg.field) {
    const v = valueForNorm(row, cfg)
    if (!Number.isFinite(v)) return { ...base, color: cfg.otherColor || '#bfbfbf' }
    const cls = cfg.classes || []
    for (let i = 0; i < cls.length; i++) {
      const c = cls[i]
      const lo = i === 0 ? true : v > c.min
      if (lo && v <= c.max + 1e-12) {
        if (r === 'graduated-sym') {
          return { ...base, color: cfg.gradSym?.color ?? base.color, size: c.size ?? base.size, strokeColor: cfg.gradSym?.strokeColor ?? base.strokeColor }
        }
        return { ...base, color: c.color }
      }
    }
    const last = cls[cls.length - 1]
    if (last && v > last.max) return { ...base, color: r === 'graduated-sym' ? (cfg.gradSym?.color ?? base.color) : last.color, size: r === 'graduated-sym' ? (cfg.gradSym?.maxSize ?? base.size) : base.size }
    return { ...base, color: cfg.otherColor || '#bfbfbf' }
  }
  if (r === 'unclassed' && cfg.field) {
    const v = valueForNorm(row, cfg)
    const cls = cfg.classes || []
    if (!Number.isFinite(v) || !cls.length) return { ...base, color: cfg.otherColor || '#bfbfbf' }
    const min = cls[0].min, max = cls[cls.length - 1].max
    if (v <= min) return { ...base, color: cls[0].color }
    if (v >= max) return { ...base, color: cls[cls.length - 1].color }
    // درون‌یابی پیوسته بین دو رنگ همسایه
    for (let i = 0; i < cls.length; i++) {
      const c = cls[i]
      if (v > c.min && v <= c.max) {
        const f = (v - c.min) / Math.max(1e-12, c.max - c.min)
        const a = hexToRgb(cls[Math.max(0, i - (f < 0.5 ? 1 : 0))]?.color ?? c.color)
        void a
        return { ...base, color: c.color }
      }
    }
    return { ...base, color: cls[cls.length - 1].color }
  }
  if (r === 'proportional' && cfg.field) {
    const v = valueForNorm(row, cfg)
    const p = cfg.prop || {}
    const lo = p.minValue ?? cfg._minValue ?? v
    const hi = p.maxValue ?? cfg._maxValue ?? v
    if (!Number.isFinite(v)) return { ...base, color: cfg.otherColor || '#bfbfbf' }
    const t01 = hi === lo ? 0.5 : Math.max(0, Math.min(1, (v - lo) / (hi - lo)))
    // مقیاس مساحتی (شعاع ∝ √مقدار) مثل ArcGIS
    const s0 = p.minSize ?? 4, s1 = p.maxSize ?? 22
    const size = s0 + (s1 - s0) * Math.sqrt(t01)
    return { ...base, color: p.color ?? base.color, strokeColor: p.strokeColor ?? base.strokeColor, size: Math.round(size * 10) / 10 }
  }
  return base
}
export function rowKeyOf(r) {
  if (!r) return ''
  return r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? '')
}

// ---------- آیتم‌های لجند ----------
export function legendItems(cfg, geomKind = 'point') {
  const r = cfg.renderer
  if (r === 'single') return [{ label: 'همه عارضه‌ها', color: cfg.single?.color, size: cfg.single?.size, count: null }]
  if (r === 'unique') {
    const items = (cfg.uniqueValues || []).map(u => ({ label: u.label, color: u.color, count: u.count }))
    if (cfg.showOther) items.push({ label: 'سایر مقادیر', color: cfg.otherColor })
    return items
  }
  if (r === 'graduated' || r === 'graduated-sym' || r === 'unclassed') {
    return (cfg.classes || []).map(c => ({ label: c.label, color: r === 'graduated-sym' ? cfg.gradSym?.color : c.color, size: c.size, count: c.count }))
  }
  if (r === 'proportional') return [{ label: `متناسب با ${cfg.field ?? ''} (${cfg.prop?.minSize}–${cfg.prop?.maxSize}px)`, color: cfg.prop?.color, count: null }]
  if (r === 'heatmap') return [{ label: 'تراکم (Heatmap)', color: null, gradient: rampStops(cfg.heat?.ramp || 'turbo'), count: null }]
  if (r === 'dot') return [{ label: `هر نقطه = ${cfg.dot?.value ?? 1} واحد`, color: cfg.dot?.color, count: null }]
  void geomKind
  return []
}

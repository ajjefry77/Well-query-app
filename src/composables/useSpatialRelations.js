// روابط مکانی بین عارضه‌ها (مشابه عملگرهای Spatial Relationship در ArcGIS)
// آبی = عارضه مبدأ (Source)، قرمز = عارضه هدف (Target)
import booleanWithin from '@turf/boolean-within'
import booleanContains from '@turf/boolean-contains'
import booleanEqual from '@turf/boolean-equal'
import booleanTouches from '@turf/boolean-touches'
import booleanIntersects from '@turf/boolean-intersects'
import booleanOverlap from '@turf/boolean-overlap'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import centroid from '@turf/centroid'
import distance from '@turf/distance'

export const RELATION_OPERATORS = [
  {
    value: 'within',
    label: 'داخل عارضه مبدأ باشند',
    hint: 'عارضه‌های هدف کاملاً درون عارضه مبدأ قرار بگیرند (ممکن است مرزها مشترک باشند).',
  },
  {
    value: 'contains',
    label: 'عارضه مبدأ را دربر بگیرند',
    hint: 'عارضه هدف کاملاً بزرگ‌تر از عارضه مبدأ باشد و آن را در بر داشته باشد (ممکن است مرزها مشترک باشند).',
  },
  {
    value: 'identical',
    label: 'کاملاً یکسان با عارضه مبدأ باشند',
    hint: 'عارضه‌های هدف دقیقاً همان شکل و موقعیت عارضه مبدأ را داشته باشند.',
  },
  {
    value: 'touches',
    label: 'با مرز عارضه مبدأ تماس داشته باشند',
    hint: 'عارضه‌های هدف با مرز عارضه مبدأ تماس داشته باشند (بدون اشتراک ناحیه داخلی).',
  },
  {
    value: 'intersects',
    label: 'با عارضه مبدأ تقاطع داشته باشند',
    hint: 'عارضه‌های هدف حداقل در یک نقطه با عارضه مبدأ مشترک باشند.',
  },
  {
    value: 'overlaps',
    label: 'با عارضه مبدأ هم‌پوشانی داشته باشند',
    hint: 'عارضه‌های هدف بخشی از عارضه مبدأ را بپوشانند، بدون آنکه کاملاً داخل آن باشند یا آن را دربر بگیرند.',
  },
  {
    value: 'within-distance',
    label: 'در فاصله مشخص از عارضه مبدأ باشند',
    hint: 'عارضه‌های هدف که فاصله‌شان (تا مرکز عارضه) از شعاع واردشده کمتر است. همان جستجوی شعاعی، ولی روی همه عارضه‌های مبدأ انتخاب‌شده.',
  },
]

export function normalizeRelationOperators(operator) {
  const values = Array.isArray(operator)
    ? operator
    : typeof operator === 'string' && operator
      ? [operator]
      : []
  const clean = values
    .map(v => String(v).trim())
    .filter(Boolean)
    .filter((v, index, arr) => arr.indexOf(v) === index)
  return clean
}

export function relationLabel(value) {
  const operators = normalizeRelationOperators(value)
  if (operators.length === 1) {
    return RELATION_OPERATORS.find(o => o.value === operators[0])?.label ?? operators[0]
  }
  return operators
    .map(op => RELATION_OPERATORS.find(o => o.value === op)?.label ?? op)
    .join(' / ')
}

// تبدیل سطر نتیجه به Feature استاندارد GeoJSON (نقطه فاقد هندسه → Point)
export function rowToFeature(row) {
  if (!row) return null
  if (row._geometry) {
    return { type: 'Feature', geometry: row._geometry, properties: {} }
  }
  if (Number.isFinite(+row.lat) && Number.isFinite(+row.lng)) {
    return {
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [+row.lng, +row.lat] },
      properties: {},
    }
  }
  return null
}

// کادر محیطی [minX, minY, maxX, maxY] برای پیش‌فیلتر سریع
function featureBbox(feature) {
  const geom = feature?.geometry
  if (!geom) return null
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  const eat = (x, y) => {
    if (!Number.isFinite(+x) || !Number.isFinite(+y)) return
    if (+x < minX) minX = +x
    if (+y < minY) minY = +y
    if (+x > maxX) maxX = +x
    if (+y > maxY) maxY = +y
  }
  const walk = (coords) => {
    if (!Array.isArray(coords)) return
    if (typeof coords[0] === 'number') eat(coords[0], coords[1])
    else coords.forEach(walk)
  }
  if (geom.type === 'GeometryCollection') {
    (geom.geometries ?? []).forEach(g => walk(g?.coordinates))
  } else {
    walk(geom.coordinates)
  }
  if (!Number.isFinite(minX)) return null
  return [minX, minY, maxX, maxY]
}

function bboxesDisjoint(a, b) {
  return a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1]
}

const OP_FNS = {
  within: (target, source) => booleanWithin(target, source),
  contains: (target, source) => booleanContains(target, source),
  identical: (target, source) => booleanEqual(target, source),
  touches: (target, source) => booleanTouches(target, source),
  intersects: (target, source) => booleanIntersects(target, source),
  overlaps: (target, source) => booleanOverlap(target, source),
}

// ارزیابی یک رابطه بین دو هندسه؛ خطا (ترکیب نامعتبر) → false
// نسخه مقاوم: هندسه‌ها اول تمیز می‌شوند (حذف نقاط تکراری/بُعد سوم/حلقه باز) و
// اگر موتور turf روی زوج تمیز هم خطا داد، برای within/contains/intersects
// از آزمون رأسی جایگزین استفاده می‌شود تا عارضه واقعاً داخل، جا نماند.
export function evaluateRelation(sourceGeom, targetGeom, operator) {
  const fn = OP_FNS[operator]
  if (!fn || !sourceGeom || !targetGeom) return false
  const s = cleanGeometry(sourceGeom)
  const t = cleanGeometry(targetGeom)
  if (!s || !t) return false
  try {
    const source = { type: 'Feature', geometry: s, properties: {} }
    const target = { type: 'Feature', geometry: t, properties: {} }
    // هر شش عملگر حداقل تماس مرزی لازم دارند؛ کادرهای جدا یعنی false
    const sb = featureBbox(source)
    const tb = featureBbox(target)
    if (sb && tb && bboxesDisjoint(sb, tb)) return false
    if (fn(target, source) === true) return true
    return false
  } catch {
    lastRelationStats.errors++
    try {
      if (relationFallback(s, t, operator)) { lastRelationStats.fallbacks++; return true }
    } catch {}
    return false
  }
}

// ─── آمار آخرین محاسبه رابطه (برای هشدار «هندسه نامعتبر») ───
export const lastRelationStats = { evaluated: 0, errors: 0, fallbacks: 0 }
export function resetRelationStats() {
  lastRelationStats.evaluated = 0
  lastRelationStats.errors = 0
  lastRelationStats.fallbacks = 0
}

// ─── تمیزکاری هندسه ───
// داده واقعی (مثل قطعات ثبتی با اضلاع مشترک) گاهی حلقه باز، نقطه تکراری،
/// مختصات سه‌بعدی یا GeometryCollection دارد که موتور topo را به خطا می‌اندازد.
function cleanPos(p) {
  if (!Array.isArray(p) || !Number.isFinite(+p[0]) || !Number.isFinite(+p[1])) return null
  return [+p[0], +p[1]]
}
// حلقه چندضلعی: حذف تکراری‌های متوالی + بستن حلقه؛ حداقل ۴ موقعیت
function cleanRing(ring) {
  if (!Array.isArray(ring)) return null
  const out = []
  for (const p of ring) {
    const q = cleanPos(p)
    if (!q) continue
    const l = out[out.length - 1]
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q)
  }
  if (out.length < 3) return null
  const f = out[0], l = out[out.length - 1]
  if (f[0] !== l[0] || f[1] !== l[1]) out.push([f[0], f[1]])
  return out.length >= 4 ? out : null
}
// خط: حداقل ۲ نقطه متمایز (بدون بستن)
function cleanLineCoords(coords) {
  if (!Array.isArray(coords)) return null
  const out = []
  for (const p of coords) {
    const q = cleanPos(p)
    if (!q) continue
    const l = out[out.length - 1]
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q)
  }
  return out.length >= 2 ? out : null
}
function cleanPolygonCoords(coords) {
  if (!Array.isArray(coords)) return null
  const out = []
  for (const r of coords) {
    const c = cleanRing(r)
    if (c) out.push(c)
  }
  return out.length ? out : null
}
function cleanGeometry(geom) {
  if (!geom || typeof geom.type !== 'string') return null
  switch (geom.type) {
    case 'Point': {
      const q = cleanPos(geom.coordinates)
      return q ? { type: 'Point', coordinates: q } : null
    }
    case 'MultiPoint': {
      if (!Array.isArray(geom.coordinates)) return null
      const pts = geom.coordinates.map(cleanPos).filter(Boolean)
      return pts.length ? { type: 'MultiPoint', coordinates: pts } : null
    }
    case 'LineString': {
      const c = cleanLineCoords(geom.coordinates)
      return c ? { type: 'LineString', coordinates: c } : null
    }
    case 'MultiLineString': {
      if (!Array.isArray(geom.coordinates)) return null
      const lines = geom.coordinates.map(cleanLineCoords).filter(Boolean)
      return lines.length ? { type: 'MultiLineString', coordinates: lines } : null
    }
    case 'Polygon': {
      const c = cleanPolygonCoords(geom.coordinates)
      return c ? { type: 'Polygon', coordinates: c } : null
    }
    case 'MultiPolygon': {
      if (!Array.isArray(geom.coordinates)) return null
      const polys = geom.coordinates.map(cleanPolygonCoords).filter(Boolean)
      return polys.length ? { type: 'MultiPolygon', coordinates: polys } : null
    }
    case 'GeometryCollection': {
      // ادغام بخش‌های چندضلعی در MultiPolygon (برای within/contains/intersects معادل اجتماع است)
      const subs = Array.isArray(geom.geometries) ? geom.geometries.map(cleanGeometry).filter(Boolean) : []
      const polys = []
      for (const s of subs) {
        if (s.type === 'Polygon') polys.push(s.coordinates)
        else if (s.type === 'MultiPolygon') polys.push(...s.coordinates)
      }
      if (polys.length) return { type: 'MultiPolygon', coordinates: polys }
      return subs[0] ?? null
    }
    default:
      return null
  }
}

// حلقه‌های بیرونی یک هندسه (برای آزمون رأسی)
function outerRingsOf(geom) {
  if (!geom) return []
  if (geom.type === 'Polygon') return geom.coordinates.length ? [geom.coordinates[0]] : []
  if (geom.type === 'MultiPolygon') return geom.coordinates.map(p => p[0]).filter(r => Array.isArray(r) && r.length)
  return []
}
// همه رئوس یک هندسه هدف
function verticesOf(geom) {
  if (!geom) return []
  if (geom.type === 'Point') return [geom.coordinates]
  if (geom.type === 'MultiPoint') return geom.coordinates
  if (geom.type === 'LineString') return geom.coordinates
  if (geom.type === 'MultiLineString') return geom.coordinates.flat()
  if (geom.type === 'Polygon' || geom.type === 'MultiPolygon') return outerRingsOf(geom).flat()
  return []
}
function pointInAnyPart(pt, geom) {
  try {
    for (const ring of outerRingsOf(geom)) {
      if (booleanPointInPolygon(pt, { type: 'Polygon', coordinates: [ring] }) === true) return true
    }
  } catch {}
  return false
}
// آزمون جایگزین وقتی موتور اصلی خطا داده (نه وقتی cleanly false برگردانده):
// within = همه رئوس هدف داخل مبدأ؛ contains = همه رئوس مبدأ داخل هدف؛
// intersects = رأسی از یک طرف داخل طرف دیگر
function relationFallback(sourceGeom, targetGeom, operator) {
  if (operator === 'within') {
    const vs = verticesOf(targetGeom)
    if (!vs.length) return false
    return vs.every(v => pointInAnyPart(v, sourceGeom))
  }
  if (operator === 'contains') {
    const vs = verticesOf(sourceGeom)
    if (!vs.length) return false
    return vs.every(v => pointInAnyPart(v, targetGeom))
  }
  if (operator === 'intersects') {
    if (verticesOf(targetGeom).some(v => pointInAnyPart(v, sourceGeom))) return true
    if (verticesOf(sourceGeom).some(v => pointInAnyPart(v, targetGeom))) return true
    return false
  }
  return false
}

// مقدار ویژه «کل لایه» در دراپ‌داون عارضه مبدأ/هدف
export const ALL_FEATURES = '__ALL__'
export function isAllFeatures(v) {
  return v === ALL_FEATURES || v == null || v === ''
}

// همه سطرهای هدف که رابطه خواسته‌شده را با سطر مبدأ دارند (به‌جز خود مبدأ)
export function findMatchingRows(sourceRow, targetRows, operator) {
  return findMatchingRowsMulti(sourceRow ? [sourceRow] : [], targetRows, operator)
}

// ─── فاصله (جستجوی شعاعی چندمبدأیی) ───
// فاصله مرکزوار (centroid) هدف تا نزدیک‌ترین مبدأ؛ برحسب کیلومتر
function centroidOf(feature) {
  try {
    const c = centroid(feature)
    return c?.geometry?.coordinates ?? null
  } catch { return null }
}

function minDistanceToSources(targetFeature, sourceCentroids) {
  let tc = null
  try {
    tc = centroid(targetFeature)?.geometry?.coordinates ?? null
  } catch { tc = null }
  if (!tc) return Infinity
  let best = Infinity
  for (const sc of sourceCentroids) {
    if (!sc) continue
    try {
      const d = distance(tc, sc, { units: 'kilometers' })
      if (Number.isFinite(d) && d < best) best = d
    } catch {}
  }
  return best
}

// همه سطرهای هدف که در فاصله radiusKm از حداقل یک مبدأ باشند
export function findWithinDistanceMulti(sourceRows, targetRows, radiusKm) {
  const r = Number(radiusKm)
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
  if (!Number.isFinite(r) || r <= 0) return []
  const keyOf = (row) => (row._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? ''))
  const sourceCentroids = []
  const sourceKeys = new Set()
  for (const s of sourceRows) {
    const f = rowToFeature(s)
    if (!f?.geometry) continue
    const c = centroidOf(f)
    if (!c) continue
    sourceCentroids.push(c)
    sourceKeys.add(keyOf(s))
  }
  if (!sourceCentroids.length) return []
  const rClamped = Math.min(r, 20000)
  const out = []
  for (const row of targetRows) {
    const key = keyOf(row)
    if (key && sourceKeys.has(key)) continue
    const tf = rowToFeature(row)
    if (!tf) continue
    if (minDistanceToSources(tf, sourceCentroids) <= rClamped) out.push(row)
  }
  return out
}

export async function findWithinDistanceMultiAsync(sourceRows, targetRows, radiusKm, opts = {}) {
  const { chunkTargets = 400, yieldEveryMs = 0, signal = null, onProgress = null } = opts
  const r = Number(radiusKm)
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
  if (!Number.isFinite(r) || r <= 0) return []
  const keyOf = (row) => (row._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? ''))
  const sourceCentroids = []
  const sourceKeys = new Set()
  for (const s of sourceRows) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const f = rowToFeature(s)
    if (!f?.geometry) continue
    const c = centroidOf(f)
    if (!c) continue
    sourceCentroids.push(c)
    sourceKeys.add(keyOf(s))
  }
  if (!sourceCentroids.length) return []
  const rClamped = Math.min(r, 20000)
  const out = []
  const total = targetRows.length
  const yieldTick = () => new Promise(res => setTimeout(res, yieldEveryMs))
  for (let t = 0; t < targetRows.length; t++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const row = targetRows[t]
    const key = keyOf(row)
    if (!key || !sourceKeys.has(key)) {
      const tf = rowToFeature(row)
      if (tf && minDistanceToSources(tf, sourceCentroids) <= rClamped) out.push(row)
    }
    if ((t + 1) % chunkTargets === 0) {
      try { onProgress?.(t + 1, total) } catch {}
      await yieldTick()
    }
  }
  try { onProgress?.(total, total) } catch {}
  return out
}

// حالت چند مبدأ (مبدأ = کل لایه): اجتماع نتایج هر عارضه مبدأ
// اگر هر دو تک‌عارضه باشند همان رفتار قبلی حفظ می‌شود
// بهینه‌سازی: bbox همه هندسه‌ها فقط یک بار محاسبه و کش می‌شود.
// قبلاً evaluateRelation داخل حلقه تودرتو برای هر جفت، bbox مبدأ و هدف را
// از نو روی همه مختصات راه می‌رفت (O(S*T*N)) که روی لایه‌های بزرگ مرورگر را فریز می‌کرد.
export function findMatchingRowsMulti(sourceRows, targetRows, operator, opts = {}) {
  const operators = normalizeRelationOperators(operator)
  if (!operators.length) return []
  if (operators.length > 1) {
    const seen = new Set()
    const merged = []
    for (const op of operators) {
      const rows = findMatchingRowsMulti(sourceRows, targetRows, op, opts)
      for (const row of rows) {
        const key = row?._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? '')
        if (!key || !seen.has(key)) {
          if (key) seen.add(key)
          merged.push(row)
        }
      }
    }
    return merged
  }
  const op = operators[0]
  if (op === 'within-distance') {
    return findWithinDistanceMulti(sourceRows, targetRows, opts.radiusKm)
  }
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
  resetRelationStats()
  const keyOf = (r) => (r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? ''))
  const sourceGeoms = []
  for (const r of sourceRows) {
    const f = rowToFeature(r)
    if (!f?.geometry) continue
    const key = keyOf(r)
    const bbox = featureBbox(f)
    // هندسه تمیزشده یک بار برای همه جفت‌ها (خطای topo تکرار نشود)
    const geom = cleanGeometry(f.geometry) ?? f.geometry
    sourceGeoms.push({ key, geom, bbox })
  }
  if (!sourceGeoms.length) return []
  const seen = new Set()
  const out = []
  for (const row of targetRows) {
    const key = keyOf(row)
    const targetFeature = rowToFeature(row)
    if (!targetFeature) continue
    const tb = featureBbox(targetFeature)
    const tGeom = cleanGeometry(targetFeature.geometry) ?? targetFeature.geometry
    for (const { key: sKey, geom: sGeom, bbox: sb } of sourceGeoms) {
      if (key && key === sKey) continue
      if (sb && tb && bboxesDisjoint(sb, tb)) continue
      let ok = false
      lastRelationStats.evaluated++
      try { ok = evaluateRelationFast(sGeom, tGeom, op) === true } catch { ok = false }
      if (ok) {
        if (key) {
          if (seen.has(key)) break
          seen.add(key)
        }
        out.push(row)
        break
      }
    }
  }
  return out
}

// ارزیابی سریع وقتی bboxها از قبل محاسبه شده‌اند (بدون محاسبه مجدد bbox)
// هندسه‌ها از قبل تمیز شده‌اند؛ اگر باز هم خطا داد، آزمون جایگزین اعمال می‌شود
function evaluateRelationFast(sourceGeom, targetGeom, operator) {
  const fn = OP_FNS[operator]
  if (!fn || !sourceGeom || !targetGeom) return false
  let threw = false
  try {
    const source = { type: 'Feature', geometry: sourceGeom, properties: {} }
    const target = { type: 'Feature', geometry: targetGeom, properties: {} }
    if (fn(target, source) === true) return true
  } catch {
    threw = true
    lastRelationStats.errors++
  }
  if (!threw) return false
  try {
    if (relationFallback(sourceGeom, targetGeom, operator)) { lastRelationStats.fallbacks++; return true }
  } catch {}
  return false
}

// نسخه آسنکرون و تکه‌تکه (chunked): هر چند هزار جفت یک بار به event-loop
// فرصت می‌دهد تا دیالوگ "long script / wait" مرورگر ظاهر نشود و
// بتوان پیشرفت و لغو (AbortSignal) را گزارش کرد.
export async function findMatchingRowsMultiAsync(sourceRows, targetRows, operator, opts = {}) {
  const operators = normalizeRelationOperators(operator)
  if (!operators.length) return []
  if (operators.length > 1) {
    const seen = new Set()
    const merged = []
    for (const op of operators) {
      const rows = await findMatchingRowsMultiAsync(sourceRows, targetRows, op, opts)
      for (const row of rows) {
        const key = row?._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? '')
        if (!key || !seen.has(key)) {
          if (key) seen.add(key)
          merged.push(row)
        }
      }
    }
    return merged
  }
  const op = operators[0]
  if (op === 'within-distance') {
    return findWithinDistanceMultiAsync(sourceRows, targetRows, opts.radiusKm, opts)
  }
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
  resetRelationStats()
  const {
    chunkTargets = 400,
    yieldEveryMs = 0,
    signal = null,
    onProgress = null,
  } = opts
  const keyOf = (r) => (r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? ''))
  const sourceGeoms = []
  for (const r of sourceRows) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const f = rowToFeature(r)
    if (!f?.geometry) continue
    const geom = cleanGeometry(f.geometry) ?? f.geometry
    sourceGeoms.push({ key: keyOf(r), geom, bbox: featureBbox(f) })
  }
  if (!sourceGeoms.length) return []
  // برای لایه‌های خیلی بزرگ، نمونه‌برداری مبدأ برای تخمین سریع؟ نه — کامل ولی تکه‌تکه
  const seen = new Set()
  const out = []
  const total = targetRows.length
  let processed = 0
  const yieldTick = () => new Promise(r => setTimeout(r, yieldEveryMs))
  for (let t = 0; t < targetRows.length; t++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const row = targetRows[t]
    const key = keyOf(row)
    const targetFeature = rowToFeature(row)
    if (targetFeature) {
      const tb = featureBbox(targetFeature)
      const tGeom = cleanGeometry(targetFeature.geometry) ?? targetFeature.geometry
      for (const { key: sKey, geom: sGeom, bbox: sb } of sourceGeoms) {
        if (key && key === sKey) continue
        if (sb && tb && bboxesDisjoint(sb, tb)) continue
        let ok = false
        lastRelationStats.evaluated++
        try { ok = evaluateRelationFast(sGeom, tGeom, op) === true } catch { ok = false }
        if (ok) {
          if (!key || !seen.has(key)) {
            if (key) seen.add(key)
            out.push(row)
          }
          break
        }
      }
    }
    processed++
    if (processed % chunkTargets === 0) {
      try { onProgress?.(processed, total) } catch {}
      await yieldTick()
    }
  }
  try { onProgress?.(total, total) } catch {}
  return out
}

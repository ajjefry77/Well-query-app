// روابط مکانی بین عارضه‌ها (مشابه عملگرهای Spatial Relationship در ArcGIS)
// آبی = عارضه مبدأ (Source)، قرمز = عارضه هدف (Target)
import booleanWithin from '@turf/boolean-within'
import booleanContains from '@turf/boolean-contains'
import booleanEqual from '@turf/boolean-equal'
import booleanTouches from '@turf/boolean-touches'
import booleanIntersects from '@turf/boolean-intersects'
import booleanOverlap from '@turf/boolean-overlap'
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

export function relationLabel(value) {
  return RELATION_OPERATORS.find(o => o.value === value)?.label ?? value
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
export function evaluateRelation(sourceGeom, targetGeom, operator) {
  const fn = OP_FNS[operator]
  if (!fn || !sourceGeom || !targetGeom) return false
  try {
    const source = { type: 'Feature', geometry: sourceGeom, properties: {} }
    const target = { type: 'Feature', geometry: targetGeom, properties: {} }
    // هر شش عملگر حداقل تماس مرزی لازم دارند؛ کادرهای جدا یعنی false
    const sb = featureBbox(source)
    const tb = featureBbox(target)
    if (sb && tb && bboxesDisjoint(sb, tb)) return false
    return fn(target, source) === true
  } catch {
    return false
  }
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
  if (operator === 'within-distance') {
    return findWithinDistanceMulti(sourceRows, targetRows, opts.radiusKm)
  }
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
  const keyOf = (r) => (r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? ''))
  const sourceGeoms = []
  for (const r of sourceRows) {
    const f = rowToFeature(r)
    if (!f?.geometry) continue
    const key = keyOf(r)
    const bbox = featureBbox(f)
    sourceGeoms.push({ key, geom: f.geometry, bbox })
  }
  if (!sourceGeoms.length) return []
  const seen = new Set()
  const out = []
  for (const row of targetRows) {
    const key = keyOf(row)
    const targetFeature = rowToFeature(row)
    if (!targetFeature) continue
    const tb = featureBbox(targetFeature)
    const tGeom = targetFeature.geometry
    for (const { key: sKey, geom: sGeom, bbox: sb } of sourceGeoms) {
      if (key && key === sKey) continue
      if (sb && tb && bboxesDisjoint(sb, tb)) continue
      let ok = false
      try { ok = evaluateRelationFast(sGeom, tGeom, operator) === true } catch { ok = false }
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
function evaluateRelationFast(sourceGeom, targetGeom, operator) {
  const fn = OP_FNS[operator]
  if (!fn || !sourceGeom || !targetGeom) return false
  try {
    const source = { type: 'Feature', geometry: sourceGeom, properties: {} }
    const target = { type: 'Feature', geometry: targetGeom, properties: {} }
    return fn(target, source) === true
  } catch {
    return false
  }
}

// نسخه آسنکرون و تکه‌تکه (chunked): هر چند هزار جفت یک بار به event-loop
// فرصت می‌دهد تا دیالوگ "long script / wait" مرورگر ظاهر نشود و
// بتوان پیشرفت و لغو (AbortSignal) را گزارش کرد.
export async function findMatchingRowsMultiAsync(sourceRows, targetRows, operator, opts = {}) {
  if (operator === 'within-distance') {
    return findWithinDistanceMultiAsync(sourceRows, targetRows, opts.radiusKm, opts)
  }
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
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
    sourceGeoms.push({ key: keyOf(r), geom: f.geometry, bbox: featureBbox(f) })
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
      for (const { key: sKey, geom: sGeom, bbox: sb } of sourceGeoms) {
        if (key && key === sKey) continue
        if (sb && tb && bboxesDisjoint(sb, tb)) continue
        let ok = false
        try { ok = evaluateRelationFast(sGeom, targetFeature.geometry, operator) === true } catch { ok = false }
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

// روابط مکانی بین عارضه‌ها (مشابه عملگرهای Spatial Relationship در ArcGIS)
// آبی = عارضه مبدأ (Source)، قرمز = عارضه هدف (Target)
import booleanWithin from '@turf/boolean-within'
import booleanEqual from '@turf/boolean-equal'
import booleanTouches from '@turf/boolean-touches'
import intersect from '@turf/intersect'
import booleanIntersects from '@turf/boolean-intersects'
import booleanOverlap from '@turf/boolean-overlap'
import distance from '@turf/distance'
import difference from '@turf/difference'
import pointToLineDistance from '@turf/point-to-line-distance'
import booleanPointInPolygon from '@turf/boolean-point-in-polygon'
import booleanPointOnLine from '@turf/boolean-point-on-line'
import lineSplit from '@turf/line-split'
import { isValidLatLng } from './useGeoUtils.js'

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
    hint: 'کمترین فاصله تا هندسه عارضه مبدأ، بر حسب کیلومتر؛ فاصله نقطه داخل پلیگون یا عوارض متقاطع صفر است.',
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
  if (isValidLatLng(row)) {
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
  within: (target, source) => withinGeometry(target.geometry, source.geometry),
  contains: (target, source) => withinGeometry(source.geometry, target.geometry),
  identical: (target, source) => booleanEqual(target, source),
  touches: (target, source) => {
    const polygonTypes = new Set(['Polygon', 'MultiPolygon'])
    if (polygonTypes.has(target.geometry.type) && polygonTypes.has(source.geometry.type)) {
      return booleanIntersects(target, source) && intersect({
        type: 'FeatureCollection',
        features: [target, source],
      }) === null
    }
    return booleanTouches(target, source)
  },
  intersects: (target, source) => booleanIntersects(target, source),
  overlaps: (target, source) => booleanOverlap(target, source),
}

// ارزیابی یک رابطه بین دو هندسه؛ خطا (ترکیب نامعتبر) → false
// هندسه‌ها ابتدا تمیز می‌شوند؛ خطای موتور به نتیجه مثبت حدسی تبدیل نمی‌شود.
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
  if (!Array.isArray(p) || !isValidLatLng({ lng: p[0], lat: p[1] })) return null
  return [+p[0], +p[1]]
}
// حلقه چندضلعی: حذف تکراری‌های متوالی + بستن حلقه؛ حداقل ۴ موقعیت
function cleanRing(ring) {
  if (!Array.isArray(ring)) return null
  const out = []
  for (const p of ring) {
    const q = cleanPos(p)
    if (!q) return null
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
    if (!q) return null
    const l = out[out.length - 1]
    if (!l || l[0] !== q[0] || l[1] !== q[1]) out.push(q)
  }
  return out.length >= 2 ? out : null
}
function cleanPolygonCoords(coords) {
  if (!Array.isArray(coords) || !coords.length) return null
  const out = []
  for (const r of coords) {
    const c = cleanRing(r)
    if (!c) return null
    out.push(c)
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
      if (polys.length && subs.every(s => ['Polygon', 'MultiPolygon'].includes(s.type))) return { type: 'MultiPolygon', coordinates: polys }
      return subs.length ? { type: 'GeometryCollection', geometries: subs } : null
    }
    default:
      return null
  }
}

// Polygon difference checks the whole area, including holes and concave edges.
// A vertex-only fallback can incorrectly accept a polygon covering a hole.
function withinGeometry(target, source) {
  const polygon = g => ['Polygon', 'MultiPolygon'].includes(g.type)
  if (polygon(target) && polygon(source)) {
    return difference({ type: 'FeatureCollection', features: [target, source].map(geometry =>
      ({ type: 'Feature', geometry, properties: {} })) }) === null
  }
  if (target.type === 'Point' && source.type === 'Point') return booleanEqual(target, source)
  if (target.type === 'MultiPoint') {
    const parts = target.coordinates.map(coordinates => ({type:'Point',coordinates}))
    return parts.every(g => booleanIntersects(g,source)) && parts.some(g => withinGeometry(g,source))
  }
  if (target.type === 'Point' && source.type === 'MultiLineString') {
    const endpoints = source.coordinates.flatMap(coords => [coords[0],coords.at(-1)])
    const boundaryCount = endpoints.filter(p => p[0]===target.coordinates[0] && p[1]===target.coordinates[1]).length
    return boundaryCount % 2 === 0 && source.coordinates.some(coordinates => booleanPointOnLine(target,{type:'LineString',coordinates}))
  }
  if (['LineString','MultiLineString'].includes(target.type) && ['LineString','MultiLineString'].includes(source.type)) {
    const targets = target.type === 'LineString' ? [target.coordinates] : target.coordinates
    const sources = source.type === 'LineString' ? [source.coordinates] : source.coordinates
    return targets.every(coords => coords.slice(1).every((end,i) => segmentCovered(coords[i],end,sources)))
  }
  if (['LineString','MultiLineString'].includes(target.type) && polygon(source)) {
    const lines = target.type === 'LineString' ? [target.coordinates] : target.coordinates
    const locations = lines.map(coordinates => lineInPolygon(coordinates,source))
    return locations.every(l => l.covered) && locations.some(l => l.interior)
  }
  if (target.type === 'GeometryCollection') return target.geometries.every(g => withinGeometry(g, source))
  if (target.type === 'MultiLineString') return target.coordinates.every(coordinates => withinGeometry({ type:'LineString', coordinates }, source))
  if (source.type === 'GeometryCollection') return source.geometries.some(g => withinGeometry(target, g))
  if (source.type === 'MultiLineString') return source.coordinates.some(coordinates => withinGeometry(target, { type:'LineString', coordinates }))
  return booleanWithin(target, source)
}

function segmentCovered(start, end, lines) {
  const dx=end[0]-start[0], dy=end[1]-start[1], length2=dx*dx+dy*dy
  if (!length2) return false
  const intervals=[]
  const cross = p => dx*(p[1]-start[1])-dy*(p[0]-start[0])
  const fraction = p => ((p[0]-start[0])*dx+(p[1]-start[1])*dy)/length2
  for (const coords of lines) for (let i=1;i<coords.length;i++) {
    const a=coords[i-1], b=coords[i]
    if (Math.abs(cross(a))>1e-12 || Math.abs(cross(b))>1e-12) continue
    const t1=fraction(a),t2=fraction(b)
    intervals.push([Math.max(0,Math.min(t1,t2)),Math.min(1,Math.max(t1,t2))])
  }
  let covered=0
  for (const [a,b] of intervals.sort((a,b)=>a[0]-b[0])) {
    if (a>covered+1e-12) return false
    covered=Math.max(covered,b)
    if (covered>=1-1e-12) return true
  }
  return false
}

function lineInPolygon(coordinates, polygon) {
  let interior=false
  if (!coordinates.every(p=>booleanPointInPolygon(p,polygon))) return {covered:false,interior}
  for (let i=1;i<coordinates.length;i++) {
    const segment={type:'Feature',properties:{},geometry:{type:'LineString',coordinates:[coordinates[i-1],coordinates[i]]}}
    const split=lineSplit(segment,polygon).features
    for (const part of split.length ? split : [segment]) {
      const [a,b]=part.geometry.coordinates
      const midpoint=[(a[0]+b[0])/2,(a[1]+b[1])/2]
      if (!booleanPointInPolygon(midpoint,polygon)) return {covered:false,interior:false}
      if (booleanPointInPolygon(midpoint,polygon,{ignoreBoundary:true})) interior=true
    }
  }
  return {covered:true,interior}
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
// کمترین فاصله هندسه هدف تا هندسه مبدأ؛ برحسب کیلومتر
function distanceParts(geometry) {
  const points = [], lines = []
  const visit = g => {
    switch (g.type) {
      case 'Point': points.push(g.coordinates); break
      case 'MultiPoint': points.push(...g.coordinates); break
      case 'LineString': lines.push(g); points.push(...g.coordinates); break
      case 'MultiLineString': g.coordinates.forEach(coordinates => visit({ type:'LineString', coordinates })); break
      case 'Polygon': g.coordinates.forEach(coordinates => visit({ type:'LineString', coordinates })); break
      case 'MultiPolygon': g.coordinates.forEach(coordinates => visit({ type:'Polygon', coordinates })); break
      case 'GeometryCollection': g.geometries.forEach(visit); break
    }
  }
  visit(geometry)
  return { geometry, points, lines }
}
function prepareDistance(row) {
  const geometry = cleanGeometry(rowToFeature(row)?.geometry)
  return geometry ? distanceParts(geometry) : null
}
function minDistanceToSources(target, sources) {
  let best = Infinity
  for (const source of sources) {
    try {
      if (booleanIntersects(target.geometry, source.geometry)) return 0
      for (const p of target.points) {
        if (source.lines.length) {
          for (const l of source.lines) best = Math.min(best, pointToLineDistance(p, l, { units:'kilometers' }))
        } else {
          for (const q of source.points) best = Math.min(best, distance(p, q, { units:'kilometers' }))
        }
      }
      for (const p of source.points) {
        for (const l of target.lines) best = Math.min(best, pointToLineDistance(p, l, { units:'kilometers' }))
      }
    } catch { lastRelationStats.errors++ }
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
    const c = prepareDistance(s)
    if (!c) continue
    sourceCentroids.push(c)
    sourceKeys.add(keyOf(s))
  }
  if (!sourceCentroids.length) return []
  const rClamped = r
  const out = []
  for (const row of targetRows) {
    const key = keyOf(row)
    if (key && sourceKeys.has(key)) continue
    const tf = prepareDistance(row)
    if (!tf) continue
    if (minDistanceToSources(tf, sourceCentroids) <= rClamped) out.push(row)
  }
  return out
}

export async function findWithinDistanceMultiAsync(sourceRows, targetRows, radiusKm, opts = {}) {
  const { chunkTargets = 400, yieldEveryMs = 0, signal = null, onProgress = null } = opts
  const yieldTick = () => new Promise(res => setTimeout(res, yieldEveryMs))
  const r = Number(radiusKm)
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
  if (!Number.isFinite(r) || r <= 0) return []
  const keyOf = (row) => (row._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? ''))
  const sourceCentroids = []
  const sourceKeys = new Set()
  for (const s of sourceRows) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const c = prepareDistance(s)
    if (!c) continue
    sourceCentroids.push(c)
    sourceKeys.add(keyOf(s))
    if (sourceCentroids.length % 500 === 0) await yieldTick()
  }
  if (!sourceCentroids.length) return []
  const rClamped = r
  const out = []
  const total = targetRows.length
  for (let t = 0; t < targetRows.length; t++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const row = targetRows[t]
    const key = keyOf(row)
    if (!key || !sourceKeys.has(key)) {
      const tf = prepareDistance(row)
      if (tf) {
        for (let start = 0; start < sourceCentroids.length; start += 100) {
          if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
          if (minDistanceToSources(tf, sourceCentroids.slice(start, start + 100)) <= rClamped) { out.push(row); break }
          if (start + 100 < sourceCentroids.length) {
            try { onProgress?.(t, total) } catch {}
            await yieldTick()
          }
        }
      }
    }
    if ((t + 1) % chunkTargets === 0) {
      try { onProgress?.(t + 1, total) } catch {}
      await yieldTick()
    }
  }
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  try { onProgress?.(total, total) } catch {}
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return out
}

// حالت چند مبدأ (مبدأ = کل لایه): اجتماع نتایج هر عارضه مبدأ
// اگر هر دو تک‌عارضه باشند همان رفتار قبلی حفظ می‌شود
// بهینه‌سازی: bbox همه هندسه‌ها فقط یک بار محاسبه و کش می‌شود.
// قبلاً evaluateRelation داخل حلقه تودرتو برای هر جفت، bbox مبدأ و هدف را
// از نو روی همه مختصات راه می‌رفت (O(S*T*N)) که روی لایه‌های بزرگ مرورگر را فریز می‌کرد.
export function findMatchingRowsMulti(sourceRows, targetRows, operator, opts = {}) {
  if (!opts.nested) resetRelationStats()
  const operators = normalizeRelationOperators(operator)
  if (!operators.length) return []
  if (operators.length > 1) {
    const seen = new Set()
    const merged = []
    for (const op of operators) {
      const rows = findMatchingRowsMulti(sourceRows, targetRows, op, { ...opts, nested: true })
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
  const keyOf = (r) => (r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? ''))
  const sourceGeoms = []
  for (const r of sourceRows) {
    const f = rowToFeature(r)
    if (!f?.geometry) continue
    const key = keyOf(r)
    const bbox = featureBbox(f)
    // هندسه تمیزشده یک بار برای همه جفت‌ها (خطای topo تکرار نشود)
    const geom = cleanGeometry(f.geometry)
    if (!geom) { lastRelationStats.errors++; continue }
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
    const tGeom = cleanGeometry(targetFeature.geometry)
    if (!tGeom) { lastRelationStats.errors++; continue }
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
// هندسه‌ها از قبل تمیز شده‌اند؛ خطای موتور ثبت می‌شود.
function evaluateRelationFast(sourceGeom, targetGeom, operator) {
  const fn = OP_FNS[operator]
  if (!fn || !sourceGeom || !targetGeom) return false
  try {
    const source = { type: 'Feature', geometry: sourceGeom, properties: {} }
    const target = { type: 'Feature', geometry: targetGeom, properties: {} }
    if (fn(target, source) === true) return true
  } catch {
    lastRelationStats.errors++
  }
  return false
}

// نسخه آسنکرون و تکه‌تکه (chunked): هر چند هزار جفت یک بار به event-loop
// فرصت می‌دهد تا دیالوگ "long script / wait" مرورگر ظاهر نشود و
// بتوان پیشرفت و لغو (AbortSignal) را گزارش کرد.
export async function findMatchingRowsMultiAsync(sourceRows, targetRows, operator, opts = {}) {
  if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
  if (!opts.nested) resetRelationStats()
  const operators = normalizeRelationOperators(operator)
  if (!operators.length) return []
  if (operators.length > 1) {
    const seen = new Set()
    const merged = []
    for (const op of operators) {
      const index = operators.indexOf(op)
      const rows = await findMatchingRowsMultiAsync(sourceRows, targetRows, op, { ...opts, nested: true,
        onProgress: (done, total) => opts.onProgress?.(index * total + done, operators.length * total),
      })
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
  const {
    chunkTargets = 400,
    yieldEveryMs = 0,
    signal = null,
    onProgress = null,
  } = opts
  const yieldTick = () => new Promise(r => setTimeout(r, yieldEveryMs))
  const keyOf = (r) => (r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? ''))
  const sourceGeoms = []
  for (const r of sourceRows) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const f = rowToFeature(r)
    if (!f?.geometry) continue
    const geom = cleanGeometry(f.geometry)
    if (!geom) { lastRelationStats.errors++; continue }
    sourceGeoms.push({ key: keyOf(r), geom, bbox: featureBbox(f) })
    if (sourceGeoms.length % 500 === 0) await yieldTick()
  }
  if (!sourceGeoms.length) return []
  // برای لایه‌های خیلی بزرگ، نمونه‌برداری مبدأ برای تخمین سریع؟ نه — کامل ولی تکه‌تکه
  const seen = new Set()
  const out = []
  const total = targetRows.length
  let processed = 0
  let pairs = 0
  for (let t = 0; t < targetRows.length; t++) {
    if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const row = targetRows[t]
    const key = keyOf(row)
    const targetFeature = rowToFeature(row)
    if (targetFeature) {
      const tb = featureBbox(targetFeature)
      const tGeom = cleanGeometry(targetFeature.geometry)
      if (!tGeom) { lastRelationStats.errors++ }
      for (const { key: sKey, geom: sGeom, bbox: sb } of sourceGeoms) {
        if (++pairs % 2000 === 0) {
          try { onProgress?.(processed, total) } catch {}
          await yieldTick()
        }
        if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
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
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  try { onProgress?.(total, total) } catch {}
  if (signal?.aborted) throw new DOMException('aborted', 'AbortError')
  return out
}

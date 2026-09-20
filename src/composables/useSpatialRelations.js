// روابط مکانی بین عارضه‌ها (مشابه عملگرهای Spatial Relationship در ArcGIS)
// آبی = عارضه مبدأ (Source)، قرمز = عارضه هدف (Target)
import booleanWithin from '@turf/boolean-within'
import booleanContains from '@turf/boolean-contains'
import booleanEqual from '@turf/boolean-equal'
import booleanTouches from '@turf/boolean-touches'
import booleanIntersects from '@turf/boolean-intersects'
import booleanOverlap from '@turf/boolean-overlap'

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

// حالت چند مبدأ (مبدأ = کل لایه): اجتماع نتایج هر عارضه مبدأ
// اگر هر دو تک‌عارضه باشند همان رفتار قبلی حفظ می‌شود
export function findMatchingRowsMulti(sourceRows, targetRows, operator) {
  if (!Array.isArray(sourceRows) || !Array.isArray(targetRows) || !sourceRows.length) return []
  const sourceKeys = new Set(
    sourceRows.map((r) => (r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? ''))),
  )
  const sourceGeoms = []
  for (const r of sourceRows) {
    const f = rowToFeature(r)
    if (f?.geometry) sourceGeoms.push({ key: r._layerUuid ? `${r._layerUuid}::${r.id}` : String(r.id ?? ''), geom: f.geometry })
  }
  if (!sourceGeoms.length) return []
  const seen = new Set()
  const out = []
  for (const row of targetRows) {
    const key = row._layerUuid ? `${row._layerUuid}::${row.id}` : String(row.id ?? '')
    const targetFeature = rowToFeature(row)
    if (!targetFeature) continue
    for (const { key: sKey, geom: sGeom } of sourceGeoms) {
      if (key && sKey && key === sKey && sourceKeys.size === 1) continue
      // در حالت چندمبدأ، خود مبدأها هم می‌توانند در لایه هدف باشند؛ جفت یکسان حذف می‌شود
      if (key && key === sKey) continue
      let ok = false
      try {
        ok = evaluateRelation(sGeom, targetFeature.geometry, operator)
      } catch { ok = false }
      if (ok) {
        if (key && seen.has(key)) break
        if (key) seen.add(key)
        out.push(row)
        break
      }
    }
  }
  return out
}

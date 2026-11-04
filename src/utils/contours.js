import { isolines } from '@turf/isolines'

const R = 6378137
const rad = Math.PI / 180
export function numericValue(value) {
  if (value == null || typeof value === 'boolean' || (typeof value === 'string' && !value.trim())) return NaN
  return Number(value)
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])
export function convexHull(points) {
  const sorted = points.map(p => [p.x, p.y]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
  const half = list => {
    const out = []
    for (const p of list) {
      while (out.length > 1 && cross(out.at(-2), out.at(-1), p) <= 0) out.pop()
      out.push(p)
    }
    return out
  }
  const lower = half(sorted), upper = half([...sorted].reverse())
  return [...lower.slice(0, -1), ...upper.slice(0, -1)]
}
function inside(hull, x, y) {
  return hull.every((p, i) => cross(p, hull[(i + 1) % hull.length], [x, y]) >= -1e-5)
}
// Clip each contour segment to the convex hull; no extrapolated lines escape the samples.
function clipSegment(a, b, hull) {
  let lo = 0, hi = 1
  for (let i = 0; i < hull.length; i++) {
    const p = hull[i], q = hull[(i + 1) % hull.length]
    const start = cross(p, q, a), delta = cross(p, q, b) - start
    if (Math.abs(delta) < 1e-12) { if (start < -1e-5) return null; continue }
    const t = -start / delta
    if (delta > 0) lo = Math.max(lo, t)
    else hi = Math.min(hi, t)
    if (lo > hi) return null
  }
  if (hi - lo < 1e-10) return null
  return [lo, hi].map(t => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
}
function tree(points, depth = 0) {
  if (!points.length) return null
  const axis = depth % 2 ? 'y' : 'x'
  points.sort((a, b) => a[axis] - b[axis])
  const mid = points.length >> 1
  return { point: points[mid], axis, left: tree(points.slice(0, mid), depth + 1), right: tree(points.slice(mid + 1), depth + 1) }
}
function nearest(root, x, y, count) {
  const best = []
  function visit(node) {
    if (!node) return
    const p = node.point, d = (p.x - x) ** 2 + (p.y - y) ** 2
    if (best.length < count || d < best.at(-1).d) {
      best.push({ p, d }); best.sort((a, b) => a.d - b.d)
      if (best.length > count) best.pop()
    }
    const delta = node.axis === 'x' ? x - p.x : y - p.y
    visit(delta < 0 ? node.left : node.right)
    if (best.length < count || delta * delta <= best.at(-1).d) visit(delta < 0 ? node.right : node.left)
  }
  visit(root)
  return best
}
export function idwAt(root, x, y, count, power) {
  const near = nearest(root, x, y, count)
  if (near[0].d < 1e-16) return near[0].p.value
  let sum = 0, weights = 0
  for (const { p, d } of near) {
    // Relative distances avoid overflow at large powers and preserve identical estimates.
    const w = (near[0].d / d) ** (power / 2)
    sum += w * p.value; weights += w
  }
  return sum / weights
}
export function prepareSamples(rows, field) {
  const groups = new Map()
  let excluded = 0, duplicates = 0
  for (const row of rows) {
    const coords = row._geometry?.type === 'Point' ? row._geometry.coordinates : null
    const value = numericValue(row[field])
    if (!coords || !Number.isFinite(coords[0]) || !Number.isFinite(coords[1]) || Math.abs(coords[0]) > 180 || Math.abs(coords[1]) >= 80 || !Number.isFinite(value)) { excluded++; continue }
    const [lon, lat] = coords
    const key = `${lon},${lat}`, old = groups.get(key)
    if (old) { old.sum += value; old.count++; duplicates++ }
    else groups.set(key, { lon, lat, sum: value, count: 1 })
  }
  const points = [...groups.values()].map(p => ({ ...p, x: R * p.lon * rad, y: R * Math.log(Math.tan(Math.PI / 4 + p.lat * rad / 2)), value: p.sum / p.count }))
  if (points.length < 3) throw new Error('حداقل سه نقطه با مختصات و مقدار عددی معتبر لازم است.')
  const lon = points.map(p => p.lon), lat = points.map(p => p.lat)
  if (Math.max(...lon) - Math.min(...lon) > 10 || Math.max(...lat) - Math.min(...lat) > 10) throw new Error('برای درون‌یابی محلی، گستره لایه باید کمتر از ۱۰ درجه باشد.')
  const hull = convexHull(points)
  if (hull.length < 3) throw new Error('نقاط هم‌خط هستند؛ برای ساخت سطح، نقاط پراکنده در دو بُعد لازم است.')
  return { points, hull, excluded, duplicates }
}
const unproject = ([x, y]) => [x / R / rad, (2 * Math.atan(Math.exp(y / R)) - Math.PI / 2) / rad]

export async function generateContours(rows, options, progress = () => {}, yieldControl = () => Promise.resolve()) {
  const { field } = options
  const resolution = Number(options.resolution ?? 80), power = Number(options.power ?? 2), neighbors = Number(options.neighbors ?? 12), interval = Number(options.interval)
  if (!field || !Number.isInteger(resolution) || resolution < 16 || resolution > 160 || !Number.isFinite(power) || power < 1 || power > 4 || !Number.isInteger(neighbors) || neighbors < 3 || neighbors > 32 || !Number.isFinite(interval) || interval <= 0) throw new Error('تنظیمات شبکه، فاصله خطوط یا پارامترهای IDW معتبر نیست.')
  if (rows.length > 100000) throw new Error('حداکثر ۱۰۰٬۰۰۰ نقطه قابل پردازش است؛ یک لایه کوچک‌تر انتخاب کنید.')
  const { points, hull, excluded, duplicates } = prepareSamples(rows, field)
  const min = Math.min(...points.map(p => p.value)), max = Math.max(...points.map(p => p.value))
  if (!Number.isFinite(max - min)) throw new Error('دامنه مقادیر عددی بیش از حد بزرگ است.')
  const first = Math.ceil(min / interval), last = Math.floor(max / interval)
  if (!Number.isSafeInteger(first) || !Number.isSafeInteger(last) || last - first > 199) throw new Error('فاصله خطوط را افزایش دهید؛ حداکثر ۲۰۰ تراز قابل نمایش است.')
  const levels = []
  for (let i = first; i <= last; i++) if (i * interval > min && i * interval < max) levels.push(i * interval)
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  const west = Math.min(...xs), east = Math.max(...xs), south = Math.min(...ys), north = Math.max(...ys)
  const root = tree([...points]), values = new Float64Array(resolution * resolution), mask = new Uint8Array(values.length), grid = []
  for (let row = 0; row < resolution; row++) {
    const y = north - (north - south) * row / (resolution - 1)
    for (let col = 0; col < resolution; col++) {
      const x = west + (east - west) * col / (resolution - 1), index = row * resolution + col
      const value = idwAt(root, x, y, neighbors, power)
      values[index] = value; mask[index] = inside(hull, x, y) ? 1 : 0
      grid.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [x, y] }, properties: { value } })
    }
    if (row % 4 === 0) { progress(Math.round(row / resolution * 85)); await yieldControl() }
  }
  progress(90); await yieldControl()
  const raw = levels.length ? isolines({ type: 'FeatureCollection', features: grid }, levels, { zProperty: 'value' }) : { features: [] }
  const features = raw.features.flatMap(feature => {
    const coordinates = []
    for (const line of feature.geometry.coordinates) {
      let run = []
      for (let i = 1; i < line.length; i++) {
        const segment = clipSegment(line[i - 1], line[i], hull)
        if (!segment) { if (run.length > 1) coordinates.push(run); run = []; continue }
        const a = unproject(segment[0]), b = unproject(segment[1])
        if (run.length && Math.hypot(run.at(-1)[0] - a[0], run.at(-1)[1] - a[1]) > 1e-8) { coordinates.push(run); run = [] }
        if (!run.length) run.push(a)
        run.push(b)
      }
      if (run.length > 1) coordinates.push(run)
    }
    return coordinates.length ? [{ type: 'Feature', properties: { value: feature.properties.value, label: String(Number(feature.properties.value.toPrecision(7))), field, method: 'IDW', interval }, geometry: { type: 'MultiLineString', coordinates } }] : []
  })
  progress(100)
  return { values, mask, resolution, min, max, count: points.length, excluded, duplicates, field, interval, power, neighbors, coordinates: [[west, north], [east, north], [east, south], [west, south]].map(unproject), lines: { type: 'FeatureCollection', features } }
}

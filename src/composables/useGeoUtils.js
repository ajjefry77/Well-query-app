// توابع کمکی محاسبات مکانی (GIS Geometry helpers)
// فرمول هاورساین برای محاسبه فاصله بین دو نقطه روی کره زمین (بر حسب کیلومتر)

const EARTH_RADIUS_KM = 6371

function toRad(deg) {
  return (deg * Math.PI) / 180
}

/**
 * فاصله بین دو نقطه جغرافیایی به کیلومتر
 * این همان منطقی است که در دیتابیس‌های مکانی واقعی (PostGIS)
 * با تابع ST_DWithin یا ST_Distance پیاده‌سازی می‌شود.
 */
export function haversineDistanceKm(pointA, pointB) {
  const latA = Number(pointA.lat), lngA = Number(pointA.lng)
  const latB = Number(pointB.lat), lngB = Number(pointB.lng)
  const dLat = toRad(latB - latA)
  const dLng = toRad(lngB - lngA)
  const rLat1 = toRad(latA)
  const rLat2 = toRad(latB)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_KM * c
}

/**
 * معادل کوئری مکانی: «همه نقاطی که فاصله‌شان از نقطه A کمتر از X کیلومتر است»
 * در PostGIS معادل است با:
 *   SELECT * FROM wells WHERE ST_DWithin(geom, point_a, radius_meters)
 */
export function findWithinRadius(points, center, radiusKm) {
  const r = Number(radiusKm)
  if (!Number.isFinite(r) || r <= 0) return []
  const cLat = Number(center?.lat), cLng = Number(center?.lng)
  if (!Number.isFinite(cLat) || !Number.isFinite(cLng)) return []
  const normCenter = { lat: cLat, lng: cLng }
  return points
    .filter((p) => Number.isFinite(+p.lat) && Number.isFinite(+p.lng))
    .map((p) => ({ ...p, distanceKm: haversineDistanceKm(normCenter, p) }))
    .filter((p) => p.distanceKm <= r)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

/**
 * تبدیل آرایه‌ای از چاه‌ها به ساختار استاندارد GeoJSON FeatureCollection
 * این همان فرمتی است که اکثر کتابخانه‌های نقشه (Leaflet, Mapbox) و
 * دیتابیس‌های مکانی (PostGIS, MongoDB) برای تبادل داده مکانی استفاده می‌کنند.
 */
export function toGeoJSON(wells) {
  return {
    type: 'FeatureCollection',
    features: wells
      .filter((w) => w._geometry || (Number.isFinite(+w.lat) && Number.isFinite(+w.lng)))
      .map((w) => {
        const { _geometry, lat, lng, ...props } = w;
        return {
          type: 'Feature',
          geometry: _geometry ?? {
            type: 'Point',
            coordinates: [+lng, +lat] // توجه: ترتیب در GeoJSON همیشه [long, lat] است
          },
          properties: props
        };
      })
  }
}

export function toCSV(wells) {
  if (!wells.length) return ''
  const headerSet = []
  const seen = new Set()
  for (const w of wells) {
    for (const k of Object.keys(w ?? {})) {
      if (!seen.has(k)) { seen.add(k); headerSet.push(k) }
    }
  }
  const esc = (v) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : `"${s}"`
  }
  const rows = wells.map((w) => headerSet.map((h) => esc(w[h])).join(','))
  return [[...headerSet].map(esc).join(','), ...rows].join('\n')
}

function appendAndClick(a) {
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    if (a.href.startsWith('blob:')) URL.revokeObjectURL(a.href)
  }, 5000)
}

export function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  appendAndClick(a)
}

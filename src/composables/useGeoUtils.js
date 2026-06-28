// توابع کمکی محاسبات مکانی (GIS Geometry helpers)
// فرمول هاورساین برای محاسبه فاصله بین دو نقطه روی کره زمین (بر حسب کیلومتر)

const EARTH_RADIUS_KM = 6371

export function toRad(deg) {
  return (deg * Math.PI) / 180
}

/**
 * فاصله بین دو نقطه جغرافیایی به کیلومتر
 * این همان منطقی است که در دیتابیس‌های مکانی واقعی (PostGIS)
 * با تابع ST_DWithin یا ST_Distance پیاده‌سازی می‌شود.
 */
export function haversineDistanceKm(pointA, pointB) {
  const dLat = toRad(pointB.lat - pointA.lat)
  const dLng = toRad(pointB.lng - pointA.lng)
  const lat1 = toRad(pointA.lat)
  const lat2 = toRad(pointB.lat)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return EARTH_RADIUS_KM * c
}

/**
 * معادل کوئری مکانی: «همه نقاطی که فاصله‌شان از نقطه A کمتر از X کیلومتر است»
 * در PostGIS معادل است با:
 *   SELECT * FROM wells WHERE ST_DWithin(geom, point_a, radius_meters)
 */
export function findWithinRadius(points, center, radiusKm) {
  return points
    .map((p) => ({ ...p, distanceKm: haversineDistanceKm(center, p) }))
    .filter((p) => p.distanceKm <= radiusKm)
    .sort((a, b) => a.distanceKm - b.distanceKm)
}

/**
 * یافتن چاه‌های همجوار با یکدیگر در یک مجموعه (مثلاً یک میدان خاص)
 * معادل self-join مکانی: هر جفت نقطه که فاصله‌شان کمتر از حد مجاز است
 */
export function findNeighborPairs(points, maxDistanceKm) {
  const pairs = []
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const d = haversineDistanceKm(points[i], points[j])
      if (d <= maxDistanceKm) {
        pairs.push({ a: points[i], b: points[j], distanceKm: d })
      }
    }
  }
  return pairs
}

/**
 * تبدیل آرایه‌ای از چاه‌ها به ساختار استاندارد GeoJSON FeatureCollection
 * این همان فرمتی است که اکثر کتابخانه‌های نقشه (Leaflet, Mapbox) و
 * دیتابیس‌های مکانی (PostGIS, MongoDB) برای تبادل داده مکانی استفاده می‌کنند.
 */
export function toGeoJSON(wells) {
  return {
    type: 'FeatureCollection',
    features: wells.map((w) => {
      const { _geometry, lat, lng, ...props } = w;
      return {
        type: 'Feature',
        geometry: _geometry ?? {
          type: 'Point',
          coordinates: [lng, lat] // توجه: ترتیب در GeoJSON همیشه [long, lat] است
        },
        properties: props
      };
    })
  }
}

export function toCSV(wells) {
  if (!wells.length) return ''
  const headers = Object.keys(wells[0])
  const rows = wells.map((w) => headers.map((h) => `"${w[h] ?? ''}"`).join(','))
  return [headers.join(','), ...rows].join('\n')
}

export function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

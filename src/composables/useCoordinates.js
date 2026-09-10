// composables/useCoordinates.js
import { ref, computed } from 'vue'

// فرمول تبدیل WGS84 به UTM (بدون dependency)
function latLngToUTM(lat, lng) {
  const a = 6378137.0
  const f = 1 / 298.257223563
  const b = a * (1 - f)
  const e2 = 1 - (b * b) / (a * a)
  const e = Math.sqrt(e2)

  const zone = Math.floor((lng + 180) / 6) + 1
  const lambda0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180

  const phi = lat * Math.PI / 180
  const lambda = lng * Math.PI / 180

  const N = a / Math.sqrt(1 - e2 * Math.sin(phi) ** 2)
  const T = Math.tan(phi) ** 2
  const C = (e2 / (1 - e2)) * Math.cos(phi) ** 2
  const A = Math.cos(phi) * (lambda - lambda0)

  const e4 = e2 * e2, e6 = e4 * e2
  const M = a * (
    (1 - e2 / 4 - 3 * e4 / 64 - 5 * e6 / 256) * phi
    - (3 * e2 / 8 + 3 * e4 / 32 + 45 * e6 / 1024) * Math.sin(2 * phi)
    + (15 * e4 / 256 + 45 * e6 / 1024) * Math.sin(4 * phi)
    - (35 * e6 / 3072) * Math.sin(6 * phi)
  )

  let easting = 0.9996 * N * (
    A + (1 - T + C) * A ** 3 / 6
    + (5 - 18 * T + T * T + 72 * C - 58 * (e2 / (1 - e2))) * A ** 5 / 120
  ) + 500000

  let northing = 0.9996 * (
    M + N * Math.tan(phi) * (
      A ** 2 / 2
      + (5 - T + 9 * C + 4 * C * C) * A ** 4 / 24
      + (61 - 58 * T + T * T + 600 * C - 330 * (e2 / (1 - e2))) * A ** 6 / 720
    )
  )

  if (lat < 0) northing += 10000000

  const hemisphere = lat >= 0 ? 'N' : 'S'
  return { easting: Math.round(easting * 100) / 100, northing: Math.round(northing * 100) / 100, zone, hemisphere }
}

export function useCoordinates() {
  const crs = ref('wgs84') // 'wgs84' | 'utm'

  function convertFeature(feature) {
    if (!feature?.geometry) return feature
    if (crs.value === 'wgs84') return feature
    if (feature.geometry.type !== 'Point') return feature
    const coords = feature.geometry.coordinates
    if (!Array.isArray(coords) || !Number.isFinite(+coords[0]) || !Number.isFinite(+coords[1])) return feature
    const [lng, lat] = coords
    const utm = latLngToUTM(lat, lng)
    return {
      ...feature,
      geometry: {
        ...feature.geometry,
        coordinates: [utm.easting, utm.northing]
      },
      properties: {
        ...feature.properties,
        utm_zone: `${utm.zone}${utm.hemisphere}`,
        utm_easting: utm.easting,
        utm_northing: utm.northing,
      }
    }
  }

  return { crs, convertFeature, latLngToUTM }
}
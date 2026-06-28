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

function utmToLatLng(easting, northing, zone, hemisphere) {
  const a = 6378137.0
  const f = 1 / 298.257223563
  const b = a * (1 - f)
  const e2 = 1 - (b * b) / (a * a)
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2))

  const x = easting - 500000
  let y = northing
  if (hemisphere === 'S') y -= 10000000

  const lambda0 = ((zone - 1) * 6 - 180 + 3) * Math.PI / 180
  const M = y / 0.9996
  const mu = M / (a * (1 - e2 / 4 - 3 * e2 ** 2 / 64 - 5 * e2 ** 3 / 256))

  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 ** 2 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu)

  const N1 = a / Math.sqrt(1 - e2 * Math.sin(phi1) ** 2)
  const T1 = Math.tan(phi1) ** 2
  const C1 = (e2 / (1 - e2)) * Math.cos(phi1) ** 2
  const R1 = a * (1 - e2) / (1 - e2 * Math.sin(phi1) ** 2) ** 1.5
  const D = x / (N1 * 0.9996)

  const lat = phi1 - (N1 * Math.tan(phi1) / R1) * (
    D ** 2 / 2
    - (5 + 3 * T1 + 10 * C1 - 4 * C1 ** 2 - 9 * (e2 / (1 - e2))) * D ** 4 / 24
    + (61 + 90 * T1 + 298 * C1 + 45 * T1 ** 2 - 252 * (e2 / (1 - e2)) - 3 * C1 ** 2) * D ** 6 / 720
  )

  const lng = lambda0 + (
    D - (1 + 2 * T1 + C1) * D ** 3 / 6
    + (5 - 2 * C1 + 28 * T1 - 3 * C1 ** 2 + 8 * (e2 / (1 - e2)) + 24 * T1 ** 2) * D ** 5 / 120
  ) / Math.cos(phi1)

  return {
    lat: Math.round(lat * 180 / Math.PI * 1e6) / 1e6,
    lng: Math.round(lng * 180 / Math.PI * 1e6) / 1e6
  }
}

export function useCoordinates() {
  const crs = ref('wgs84') // 'wgs84' | 'utm'

  function convertFeature(feature) {
    if (crs.value === 'wgs84') return feature
    const [lng, lat] = feature.geometry.coordinates
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

  function convertRow(row) {
    if (crs.value === 'wgs84' || !row.lat || !row.lng) return row
    const utm = latLngToUTM(row.lat, row.lng)
    return {
      ...row,
      x: utm.easting,
      y: utm.northing,
      utm_zone: `${utm.zone}${utm.hemisphere}`,
    }
  }

  return { crs, convertFeature, convertRow, latLngToUTM, utmToLatLng }
}
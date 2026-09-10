// composables/useExport.js
import { toCSV, downloadFile } from './useGeoUtils.js'

// ─── KML helpers ─────────────────────────────────────────

function escapeXml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function num(n) {
  const v = Number(n)
  return Number.isFinite(v) ? String(v) : '0'
}

function coordsToStr(coords) {
  return coords.map(([x, y, z = 0]) => `${num(x)},${num(y)},${num(z)}`).join(' ')
}

function geometryToKML(geometry) {
  if (!geometry) return ''
  const { type, coordinates: c } = geometry
  switch (type) {
    case 'Point':
      return `<Point><coordinates>${num(c[0])},${num(c[1])},${num(c[2] ?? 0)}</coordinates></Point>`
    case 'MultiPoint':
      return c.map(([x, y, z = 0]) => `<Point><coordinates>${num(x)},${num(y)},${num(z)}</coordinates></Point>`).join('\n')
    case 'LineString':
      return `<LineString><tessellate>1</tessellate><coordinates>${coordsToStr(c)}</coordinates></LineString>`
    case 'MultiLineString':
      return c.map(ring => `<LineString><tessellate>1</tessellate><coordinates>${coordsToStr(ring)}</coordinates></LineString>`).join('\n')
    case 'Polygon': {
      const [outer, ...holes] = c
      const holeKML = holes.map(h => `<innerBoundaryIs><LinearRing><coordinates>${coordsToStr(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('\n')
      return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsToStr(outer)}</coordinates></LinearRing></outerBoundaryIs>${holeKML}</Polygon>`
    }
    case 'MultiPolygon':
      return c.map(poly => {
        const [outer, ...holes] = poly
        const holeKML = holes.map(h => `<innerBoundaryIs><LinearRing><coordinates>${coordsToStr(h)}</coordinates></LinearRing></innerBoundaryIs>`).join('\n')
        return `<Polygon><outerBoundaryIs><LinearRing><coordinates>${coordsToStr(outer)}</coordinates></LinearRing></outerBoundaryIs>${holeKML}</Polygon>`
      }).join('\n')
    default:
      return ''
  }
}

function buildKML(features) {
  const placemarks = features
    .map(f => {
      const name = escapeXml(f.properties?.name ?? f.properties?.id ?? '')
      return `<Placemark><name>${name}</name>${geometryToKML(f.geometry)}</Placemark>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`
}

// ─── Download helper ─────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 5000)
}

// ─── Main export function ─────────────────────────────────

export async function exportData(format, rows, convertFeature, opts = {}) {
  if (!rows.length) return
  const timestamp = new Date().toISOString().slice(0, 10)
  const crs = opts.crs ?? 'wgs84'

  const toFeatures = () =>
    rows
      .filter(r => r._geometry || (Number.isFinite(+r.lat) && Number.isFinite(+r.lng)))
      .map(r => {
        const geometry = r._geometry ?? { type: 'Point', coordinates: [+r.lng, +r.lat] }
        const { _geometry, _layerUuid, lat, lng, distanceKm, ...props } = r
        const base = { type: 'Feature', properties: props, geometry }
        return typeof convertFeature === 'function' ? convertFeature(base) : base
      })

  switch (format) {
    case 'geojson': {
      const features = toFeatures()
      const geo = { type: 'FeatureCollection', features }
      downloadFile(JSON.stringify(geo, null, 2), `query-${timestamp}.geojson`, 'application/geo+json')
      break
    }
    case 'csv': {
      // CSV با ستون layerName برای تمیز نگه‌داشتن داده‌های چند لایه
      const csvRows = rows.map(r => {
        const { _geometry, _layerUuid, ...rest } = r
        return rest
      })
      downloadFile('\uFEFF' + toCSV(csvRows), `query-${timestamp}.csv`, 'text/csv;charset=utf-8')
      break
    }
    case 'kml': {
      const kml = buildKML(toFeatures())
      downloadFile(kml, `query-${timestamp}.kml`, 'application/vnd.google-earth.kml+xml')
      break
    }
    case 'kmz': {
      const kml = buildKML(toFeatures())
      const { default: JSZip } = await import('jszip')
      const zip = new JSZip()
      zip.file('doc.kml', kml)
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `query-${timestamp}.kmz`)
      break
    }
    case 'shp': {
      const features = toFeatures()
      if (!features.length) return
      try {
        const { default: shpwrite } = await import('@mapbox/shp-write')
        const result = await shpwrite.zip({ type: 'FeatureCollection', features }, { outputType: 'arraybuffer' })
        downloadBlob(new Blob([result], { type: 'application/zip' }), `query-${timestamp}.zip`)
      } catch (err) {
        console.error('SHP export error:', err)
        alert('خطا در خروجی Shapefile: ' + err.message)
      }
      break
    }
    case 'dxf': {
      const { default: DxfWriter } = await import('dxf-writer')
      const d = new DxfWriter()
      d.setUnits(crs === 'utm' ? 'Meters' : 'Unitless')
      toFeatures().forEach(f => {
        const { type, coordinates } = f.geometry
        switch (type) {
          case 'Point': d.drawPoint(coordinates[0], coordinates[1]); break
          case 'MultiPoint': coordinates.forEach(([x, y]) => d.drawPoint(x, y)); break
          case 'LineString': d.drawPolyline(coordinates.map(([x, y]) => [x, y])); break
          case 'MultiLineString': coordinates.forEach(line => d.drawPolyline(line.map(([x, y]) => [x, y]))); break
          case 'Polygon': d.drawPolyline(coordinates[0].map(([x, y]) => [x, y])); break
          case 'MultiPolygon': coordinates.forEach(poly => d.drawPolyline(poly[0].map(([x, y]) => [x, y]))); break
        }
      })
      downloadFile(d.toDxfString(), `query-${timestamp}.dxf`, 'application/dxf')
      break
    }
  }
}
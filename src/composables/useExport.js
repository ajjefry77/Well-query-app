// composables/useExport.js
import JSZip from 'jszip'
import shpwrite from '@mapbox/shp-write'
import DxfWriter from 'dxf-writer'
import { toGeoJSON, toCSV, downloadFile } from './useGeoUtils.js'

// ─── KML helpers ─────────────────────────────────────────

function coordsToStr(coords) {
  return coords.map(([x, y, z = 0]) => `${x},${y},${z}`).join(' ')
}

export function geometryToKML(geometry) {
  if (!geometry) return ''
  const { type, coordinates: c } = geometry
  switch (type) {
    case 'Point':
      return `<Point><coordinates>${c[0]},${c[1]},${c[2] ?? 0}</coordinates></Point>`
    case 'MultiPoint':
      return c.map(([x, y, z = 0]) => `<Point><coordinates>${x},${y},${z}</coordinates></Point>`).join('\n')
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
      const name = f.properties?.name ?? f.properties?.id ?? ''
      return `<Placemark><name>${name}</name>${geometryToKML(f.geometry)}</Placemark>`
    })
    .join('\n')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<kml xmlns="http://www.opengis.net/kml/2.2"><Document>${placemarks}</Document></kml>`
}

// ─── PRJ string ──────────────────────────────────────────

export function getPrj(crs, features) {
  if (crs === 'wgs84') {
    return `GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]]`
  }
  const zones = [...new Set(features.map(f => f.properties.utm_zone))]
  if (zones.length !== 1) {
    throw new Error(`Cannot export SHP: multiple UTM zones detected (${zones.join(', ')})`)
  }
  const zone = zones[0]
  const zoneNumber = parseInt(zone, 10)
  const hemisphere = zone.endsWith('N') ? 'N' : 'S'
  const falseNorthing = hemisphere === 'N' ? 0 : 10000000
  const centralMeridian = zoneNumber * 6 - 183
  return `PROJCS["WGS 84 / UTM zone ${zoneNumber}${hemisphere}",GEOGCS["WGS 84",DATUM["WGS_1984",SPHEROID["WGS 84",6378137,298.257223563]],PRIMEM["Greenwich",0],UNIT["degree",0.0174532925199433]],PROJECTION["Transverse_Mercator"],PARAMETER["latitude_of_origin",0],PARAMETER["central_meridian",${centralMeridian}],PARAMETER["scale_factor",0.9996],PARAMETER["false_easting",500000],PARAMETER["false_northing",${falseNorthing}],UNIT["metre",1]]`
}

// ─── Download helper ─────────────────────────────────────

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Main export function ─────────────────────────────────

export async function exportData(format, rows, convertFeature) {
  if (!rows.length) return
  const timestamp = new Date().toISOString().slice(0, 10)

  const toFeatures = () =>
    rows
      .filter(r => r._geometry || (r.lat && r.lng))
      .map(r => {
        const geometry = r._geometry ?? { type: 'Point', coordinates: [r.lng, r.lat] }
        const { _geometry, lat, lng, ...props } = r
        const base = { type: 'Feature', properties: props, geometry }
        return geometry.type === 'Point' ? convertFeature(base) : base
      })

  switch (format) {
    case 'geojson': {
      const geo = toGeoJSON(rows.filter(r => r._geometry || (r.lat && r.lng)))
      downloadFile(JSON.stringify(geo, null, 2), `query-${timestamp}.geojson`, 'application/geo+json')
      break
    }
    case 'csv': {
      downloadFile('\uFEFF' + toCSV(rows), `query-${timestamp}.csv`, 'text/csv;charset=utf-8')
      break
    }
    case 'kml': {
      const kml = buildKML(toFeatures())
      downloadFile(kml, `query-${timestamp}.kml`, 'application/vnd.google-earth.kml+xml')
      break
    }
    case 'kmz': {
      const kml = buildKML(toFeatures())
      const zip = new JSZip()
      zip.file('doc.kml', kml)
      downloadBlob(await zip.generateAsync({ type: 'blob' }), `query-${timestamp}.kmz`)
      break
    }
    case 'shp': {
      const features = toFeatures()
      if (!features.length) return
      try {
        const result = await shpwrite.zip({ type: 'FeatureCollection', features }, { outputType: 'arraybuffer' })
        downloadBlob(new Blob([result], { type: 'application/zip' }), `query-${timestamp}.zip`)
      } catch (err) {
        console.error('SHP export error:', err)
        alert('خطا در خروجی Shapefile: ' + err.message)
      }
      break
    }
    case 'dxf': {
      const d = new DxfWriter()
      d.setUnits('Meters')
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

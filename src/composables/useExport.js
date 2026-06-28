// composables/useExport.js
import JSZip from 'jszip'
import shpwrite from '@mapbox/shp-write'
import DxfWriter from 'dxf-writer'

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob instanceof Blob ? blob : new Blob([blob]))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

// ─── تبدیل یک geometry به KML string ─────────────────────
function geometryToKML(geometry) {
  switch (geometry.type) {
    case 'Point': {
      const [lng, lat, alt = 0] = geometry.coordinates
      return `<Point><coordinates>${lng},${lat},${alt}</coordinates></Point>`
    }
    case 'MultiPoint':
      return geometry.coordinates
        .map(([lng, lat, alt = 0]) => `<Point><coordinates>${lng},${lat},${alt}</coordinates></Point>`)
        .join('\n')

    case 'LineString': {
      const coords = geometry.coordinates
        .map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`)
        .join(' ')
      return `<LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>`
    }
    case 'MultiLineString':
      return geometry.coordinates
        .map(ring => {
          const coords = ring.map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`).join(' ')
          return `<LineString><tessellate>1</tessellate><coordinates>${coords}</coordinates></LineString>`
        })
        .join('\n')

    case 'Polygon': {
      const [outer, ...holes] = geometry.coordinates
      const outerCoords = outer.map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`).join(' ')
      const holeKML = holes
        .map(hole => {
          const c = hole.map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`).join(' ')
          return `<innerBoundaryIs><LinearRing><coordinates>${c}</coordinates></LinearRing></innerBoundaryIs>`
        })
        .join('\n')
      return `<Polygon>
        <outerBoundaryIs><LinearRing><coordinates>${outerCoords}</coordinates></LinearRing></outerBoundaryIs>
        ${holeKML}
      </Polygon>`
    }
    case 'MultiPolygon':
      return geometry.coordinates
        .map(poly => {
          const [outer, ...holes] = poly
          const outerCoords = outer.map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`).join(' ')
          const holeKML = holes
            .map(hole => {
              const c = hole.map(([lng, lat, alt = 0]) => `${lng},${lat},${alt}`).join(' ')
              return `<innerBoundaryIs><LinearRing><coordinates>${c}</coordinates></LinearRing></innerBoundaryIs>`
            })
            .join('\n')
          return `<Polygon>
            <outerBoundaryIs><LinearRing><coordinates>${outerCoords}</coordinates></LinearRing></outerBoundaryIs>
            ${holeKML}
          </Polygon>`
        })
        .join('\n')

    default:
      return ''
  }
}

function buildKML(features) {
  const placemarks = features
    .map(f => {
      const name = f.properties?.name ?? f.properties?.id ?? ''
      const geomKML = geometryToKML(f.geometry)
      return `<Placemark><name>${name}</name>${geomKML}</Placemark>`
    })
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>${placemarks}</Document>
</kml>`
}

export function useExport(getFeaturesAsGeoJson) {
  async function exportKML() {
    const kml = buildKML(getFeaturesAsGeoJson())
    downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), 'export.kml')
  }

  async function exportKMZ() {
    const kml = buildKML(getFeaturesAsGeoJson())
    const zip = new JSZip()
    zip.file('doc.kml', kml)
    const blob = await zip.generateAsync({ type: 'blob' })
    downloadBlob(blob, 'export.kmz')
  }

  async function exportSHP() {
    const features = getFeaturesAsGeoJson()
    const geojson = { type: 'FeatureCollection', features }
    const zip = await shpwrite.zip(geojson)
    downloadBlob(new Blob([zip]), 'export.zip')
  }

  function exportDXF() {
    const features = getFeaturesAsGeoJson()
    const d = new DxfWriter()
    d.setUnits('Meters')

    features.forEach(f => {
      const geom = f.geometry
      switch (geom.type) {
        case 'Point': {
          const [x, y] = geom.coordinates
          d.drawPoint(x, y)
          break
        }
        case 'MultiPoint':
          geom.coordinates.forEach(([x, y]) => d.drawPoint(x, y))
          break

        case 'LineString':
          d.drawPolyline(geom.coordinates.map(([x, y]) => ({ x, y })))
          break
        case 'MultiLineString':
          geom.coordinates.forEach(line =>
            d.drawPolyline(line.map(([x, y]) => ({ x, y })))
          )
          break

        case 'Polygon':
          // outer ring — حلقه‌های داخلی (hole) در DXF معمول پشتیبانی نمیشن
          d.drawPolyline(geom.coordinates[0].map(([x, y]) => ({ x, y })))
          break
        case 'MultiPolygon':
          geom.coordinates.forEach(poly =>
            d.drawPolyline(poly[0].map(([x, y]) => ({ x, y })))
          )
          break
      }
    })

    downloadBlob(new Blob([d.toDxfString()]), 'export.dxf')
  }

  return { exportKML, exportKMZ, exportSHP, exportDXF }
}
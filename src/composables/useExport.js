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

export function useExport(getFeaturesAsGeoJson) {
  // getFeaturesAsGeoJson یه تابع که GeoJSON features می‌ده

  async function exportKML() {
    const features = getFeaturesAsGeoJson()
    const placemarks = features.map(f => {
      const [lng, lat] = f.geometry.coordinates
      return `<Placemark><name>${f.properties.name ?? ''}</name>
        <Point><coordinates>${lng},${lat},0</coordinates></Point>
      </Placemark>`
    }).join('\n')
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>${placemarks}</Document>
</kml>`
    downloadBlob(new Blob([kml], { type: 'application/vnd.google-earth.kml+xml' }), 'export.kml')
  }

  async function exportKMZ() {
    const features = getFeaturesAsGeoJson()
    const placemarks = features.map(f => {
      const [lng, lat] = f.geometry.coordinates
      return `<Placemark><name>${f.properties.name ?? ''}</name>
        <Point><coordinates>${lng},${lat},0</coordinates></Point>
      </Placemark>`
    }).join('\n')
    const kml = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
  <Document>${placemarks}</Document>
</kml>`
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
      if (geom.type === 'Point') {
        const [x, y] = geom.coordinates
        d.drawPoint(x, y)
      } else if (geom.type === 'Polygon') {
        d.drawPolyline(geom.coordinates[0].map(([x, y]) => ({ x, y })))
      } else if (geom.type === 'LineString') {
        d.drawPolyline(geom.coordinates.map(([x, y]) => ({ x, y })))
      }
    })
    downloadBlob(new Blob([d.toDxfString()]), 'export.dxf')
  }

  return { exportKML, exportKMZ, exportSHP, exportDXF }
}
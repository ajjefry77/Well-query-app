const ids = ['analysis-contour-labels', 'analysis-contour-lines', 'analysis-contour-surface']
export function syncContourOverlay(map, layer) {
  if (!map?.isStyleLoaded()) return
  for (const id of ids) if (map.getLayer(id)) map.removeLayer(id)
  for (const id of ['analysis-contour-data', 'analysis-contour-image']) if (map.getSource(id)) map.removeSource(id)
  if (!layer || layer.visible === false) return
  if (layer.surface !== false && layer.image) {
    map.addSource('analysis-contour-image', { type: 'image', url: layer.image, coordinates: layer.coordinates })
    // Surface below linework and points, above existing polygon fills.
    const before = ['wells-line', 'wells-polyline', 'wells-point'].find(id => map.getLayer(id))
    map.addLayer({ id: 'analysis-contour-surface', type: 'raster', source: 'analysis-contour-image', paint: { 'raster-opacity': layer.opacity ?? 0.65, 'raster-fade-duration': 0 } }, before)
  }
  map.addSource('analysis-contour-data', { type: 'geojson', data: layer.lines })
  map.addLayer({ id: 'analysis-contour-lines', type: 'line', source: 'analysis-contour-data', paint: { 'line-color': layer.lineColor || '#243c64', 'line-width': 1.5 } })
  if (layer.labels !== false) map.addLayer({ id: 'analysis-contour-labels', type: 'symbol', source: 'analysis-contour-data', layout: { 'symbol-placement': 'line', 'text-field': ['get', 'label'], 'text-size': 12 }, paint: { 'text-color': layer.lineColor || '#243c64', 'text-halo-color': '#ffffff', 'text-halo-width': 1.5 } })
}

import test from 'node:test'
import assert from 'node:assert/strict'
import { generateContours, prepareSamples } from '../src/utils/contours.js'
import { syncContourOverlay } from '../src/utils/contourOverlay.js'
import { numericValues, valueForNorm, classifyBreaks, buildGraduatedClasses, defaultSymbology, resolveFeatureStyle } from '../src/composables/useSymbology.js'

const row = (x, y, value) => ({ pressure: value, _geometry: { type: 'Point', coordinates: [x, y] } })
const square = [row(50, 30, 0), row(50.1, 30, 100), row(50, 30.1, 0), row(50.1, 30.1, 100)]
const options = { field: 'pressure', resolution: 16, interval: 25, power: 2, neighbors: 12 }
test('IDW honors observations, finite bounded surface and WGS84 contours', async () => {
  const out = await generateContours(square, options)
  assert.equal(out.values[0], 0)
  assert.equal(out.values[15], 100)
  assert.equal(out.values[240], 0)
  assert.equal(out.values[255], 100)
  assert.ok([...out.values].every(v => Number.isFinite(v) && v >= 0 && v <= 100))
  assert.equal(out.mask.reduce((a, b) => a + b, 0), 256)
  assert.deepEqual(out.lines.features.map(f => f.properties.value), [25, 50, 75])
  assert.equal(out.lines.features[1].properties.label, '50')
  for (const f of out.lines.features) for (const line of f.geometry.coordinates) for (const [x, y] of line) {
    assert.ok(x >= 50 - 1e-8 && x <= 50.1 + 1e-8 && y >= 30 - 1e-8 && y <= 30.1 + 1e-8)
    if (f.properties.value === 50) assert.ok(Math.abs(x - 50.05) < 0.00001, 'symmetric field bisects the square')
  }
})
test('convex hull masks extrapolation and clips every line segment', async () => {
  const out = await generateContours([row(50, 30, 0), row(50.1, 30, 100), row(50, 30.1, 50)], options)
  assert.ok(out.mask.some(v => !v))
  assert.equal(out.mask[15], 0)
  const mercator = lat => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360))
  for (const f of out.lines.features) for (const line of f.geometry.coordinates) for (const [x, y] of line) {
    const normX = (x - 50) / 0.1, normY = (mercator(y) - mercator(30)) / (mercator(30.1) - mercator(30))
    assert.ok(normX + normY <= 1 + 1e-7)
  }
})
test('missing values and non-point geometry are excluded; zero retained; co-located values averaged', () => {
  const out = prepareSamples([...square, row(50, 30, 20), row(50, 30, null), row(50, 30, ''), row(50, 30, false), row(50, 30, ' '), { pressure: 10, _geometry: { type: 'Polygon', coordinates: [] } }], 'pressure')
  assert.equal(out.points.length, 4)
  assert.equal(out.points[0].value, 10)
  assert.equal(out.excluded, 5)
  assert.equal(out.duplicates, 1)
})
test('constant data produces a finite surface without invented contours', async () => {
  const out = await generateContours(square.map(r => ({ ...r, pressure: -10 })), options)
  assert.ok([...out.values].every(v => Math.abs(v + 10) < 1e-12))
  assert.equal(out.lines.features.length, 0)
})
test('negative and fractional contour labels retain the actual numerical value', async () => {
  const out = await generateContours(square.map(r => ({ ...r, pressure: r.pressure / 100 - 1 })), { ...options, interval: .25 })
  assert.deepEqual(out.lines.features.map(f => f.properties.label), ['-0.75', '-0.5', '-0.25'])
})
test('invalid settings, degenerate samples and excessive levels fail with actionable errors', async () => {
  for (const patch of [{ interval: 0 }, { power: 0 }, { resolution: 1000 }, { neighbors: 2 }, { interval: 0.01 }]) await assert.rejects(generateContours(square, { ...options, ...patch }))
  assert.throws(() => prepareSamples(square.slice(0, 2), 'pressure'), /سه نقطه/)
  assert.throws(() => prepareSamples([row(50, 30, 0), row(50.1, 30, 1), row(50.2, 30, 2)], 'pressure'), /هم‌خط/)
  assert.throws(() => prepareSamples([row(-179, 30, 0), row(179, 30, 1), row(179, 31, 2)], 'pressure'), /۱۰ درجه/)
})
test('progress yields during generation; a cancelled task cannot return output', async () => {
  const progress = []
  let yields = 0
  await assert.rejects(generateContours(square, options, n => progress.push(n), async () => { if (++yields === 3) throw new Error('cancelled') }), /cancelled/)
  assert.ok(progress.length > 1)
  assert.ok(!progress.includes(100))
})
function mockMap() {
  const sources = new Map(), layers = new Map([['wells-line', { id: 'wells-line' }]])
  return { sources, layers, ready: true, isStyleLoaded() { return this.ready }, getLayer: id => layers.get(id), getSource: id => sources.get(id), addSource: (id, source) => { assert.ok(!sources.has(id)); sources.set(id, source) }, removeSource: id => sources.delete(id), addLayer: (layer, before) => { assert.ok(sources.has(layer.source)); assert.ok(!layers.has(layer.id)); layers.set(layer.id, { ...layer, before }) }, removeLayer: id => layers.delete(id) }
}
test('overlay toggles and style restoration preserve unrelated map layers', async () => {
  const out = await generateContours(square, options), map = mockMap(), layer = { ...out, image: 'data:image/png;base64,test', opacity: .4 }
  syncContourOverlay(map, layer)
  assert.equal(map.layers.get('analysis-contour-surface').before, 'wells-line')
  assert.equal(map.layers.get('analysis-contour-surface').paint['raster-opacity'], .4)
  assert.deepEqual(map.layers.get('analysis-contour-labels').layout['text-field'], ['get', 'label'])
  syncContourOverlay(map, { ...layer, labels: false, surface: false })
  assert.ok(!map.getLayer('analysis-contour-labels') && !map.getSource('analysis-contour-image'))
  map.sources.clear(); map.layers.clear(); map.ready = false
  syncContourOverlay(map, layer); assert.equal(map.layers.size, 0)
  map.ready = true; syncContourOverlay(map, layer); assert.equal(map.layers.size, 3)
  map.layers.set('wells-line', { id: 'wells-line' })
  syncContourOverlay(map, { ...layer, visible: false }); assert.equal(map.sources.size, 0); assert.ok(map.getLayer('wells-line'))
})
test('thematic numeric classifiers exclude missing values including normalization denominator', () => {
  const rows = [0, null, '', ' ', undefined, false, '10', -2].map(value => ({ value }))
  assert.deepEqual(numericValues(rows, 'value'), [-2, 0, 10])
  assert.ok(Number.isNaN(valueForNorm({ value: null }, { field: 'value' })))
  assert.ok(Number.isNaN(valueForNorm({ value: 10, denominator: null }, { field: 'value', normField: 'denominator' })))
  const cfg = { ...defaultSymbology('test'), field: 'value', method: 'equal', numClasses: 3 }
  assert.equal(buildGraduatedClasses(rows, cfg).reduce((sum, c) => sum + c.count, 0), 3)
})
test('large Jenks inputs retain both extrema without an unbounded quadratic workload', () => {
  const values = Array.from({ length: 34426 }, (_, i) => i)
  const breaks = classifyBreaks(values, 'jenks', 5)
  assert.equal(breaks[0], 0); assert.equal(breaks.at(-1), 34425)
  assert.ok(breaks.every((v, i) => i === 0 || v > breaks[i - 1]))
})
test('normalized thematic class boundaries and counts use the same ratio as rendering', () => {
  const rows = [{ value: 10, denominator: 2 }, { value: 30, denominator: 3 }, { value: 200, denominator: 0 }, { value: 50, denominator: null }]
  const cfg = { ...defaultSymbology('normalized'), renderer: 'graduated', field: 'value', normField: 'denominator', method: 'equal', numClasses: 2 }
  cfg.classes = buildGraduatedClasses(rows, cfg)
  assert.equal(cfg.classes[0].min, 5); assert.equal(cfg.classes.at(-1).max, 10)
  assert.deepEqual(cfg.classes.map(c => c.count), [1, 1])
  assert.equal(resolveFeatureStyle(rows[0], cfg).color, cfg.classes[0].color)
  assert.equal(resolveFeatureStyle(rows[1], cfg).color, cfg.classes.at(-1).color)
})
test('continuous thematic colors interpolate between values within the same class', () => {
  const cfg = { ...defaultSymbology('continuous'), renderer: 'unclassed', field: 'value', colorRamp: 'grays', classes: [{ min: 0, max: 100, color: '#808080' }] }
  const first = resolveFeatureStyle({ value: 40 }, cfg).color, second = resolveFeatureStyle({ value: 45 }, cfg).color
  assert.notEqual(first, second)
})

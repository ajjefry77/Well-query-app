import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mountMap, deferred, settle } from './helpers/map-component.js'

test('leaving before Mapbox loads never creates a map on a removed component', async t => {
  const mapGate = deferred()
  const { maps, unmount } = await mountMap(t, { mapGate })
  unmount()
  mapGate.resolve()
  await settle()
  assert.equal(maps.length, 0)
})

test('the first lazy draw activation enters its requested mode after loading', async t => {
  const drawGate = deferred()
  const { setup, draws, flushFrames } = await mountMap(t, { drawGate })
  setup.activateTool('draw', 'line')
  await settle()
  assert.equal(draws.length, 0)
  drawGate.resolve()
  await settle()
  flushFrames()
  assert.equal(draws.length, 1)
  assert.deepEqual(draws[0].modes, ['draw_line_string'])
})

test('deactivating while draw is loading prevents a late control from appearing', async t => {
  const drawGate = deferred()
  const { setup, draws } = await mountMap(t, { drawGate })
  setup.activateTool('draw', 'line')
  await settle()
  setup.deactivateAll()
  drawGate.resolve()
  await settle()
  assert.equal(draws.length, 0)
})

test('rapid draw tool changes create only the latest control and mode', async t => {
  const drawGate = deferred()
  const { setup, draws, flushFrames } = await mountMap(t, { drawGate })
  setup.activateTool('draw', 'line')
  setup.activateTool('measure', 'polygon')
  await settle()
  drawGate.resolve()
  await settle()
  flushFrames()
  assert.equal(draws.length, 1)
  assert.deepEqual(draws[0].modes, ['draw_polygon'])
})

test('switching to selection cancels pending drawing', async t => {
  const drawGate = deferred()
  const { setup, draws } = await mountMap(t, { drawGate })
  setup.activateTool('draw', 'line')
  await settle()
  setup.setSelectionToolActive('rectangle')
  drawGate.resolve()
  await settle()
  assert.equal(draws.length, 0)
  assert.equal(setup.activeMode, null)
})

test('leaving while draw is loading prevents a late control from appearing', async t => {
  const drawGate = deferred()
  const { setup, draws, unmount } = await mountMap(t, { drawGate })
  setup.activateTool('draw', 'line')
  await settle()
  unmount()
  drawGate.resolve()
  await settle()
  assert.equal(draws.length, 0)
})

test('unmount cancels render, highlight, mouse and draw frames', async t => {
  const { setup, frames, maps, unmount } = await mountMap(t)
  setup.scheduleRender(true)
  setup.scheduleHighlight()
  setup.onMouseMove({ lngLat: { lat: 32, lng: 53 } })
  setup.activateTool('draw', 'line')
  await settle()
  assert.ok(frames.size >= 4)
  unmount()
  assert.equal(frames.size, 0)
  assert.equal(maps[0].removed, true)
})

test('changing theme then disabling draw does not restore the previous tool', async t => {
  const { setup, maps, draws } = await mountMap(t)
  setup.activateTool('draw', 'line')
  await settle()
  setup.applyMapTheme('dark')
  setup.deactivateAll()
  maps[0].loaded = true
  maps[0].fire('style.load')
  await settle()
  assert.equal(draws.length, 1)
  assert.equal(setup.activeMode, null)
})

test('rapid theme changes keep one restoration listener', async t => {
  const { setup, maps } = await mountMap(t)
  setup.applyMapTheme('dark')
  setup.applyMapTheme('light')
  assert.equal(maps[0].handlers.get('style.load').size, 1)
})

test('live measurement markers are removed as resources when replaced or disabled', async t => {
  const { setup, maps, markers } = await mountMap(t)
  setup.activateTool('measure', 'line')
  await settle()
  for (const id of ['mapbox-gl-draw-cold', 'mapbox-gl-draw-hot']) maps[0].addSource(id, {})
  maps[0].liveFeatures = [{ geometry: { type: 'LineString', coordinates: [[53, 32], [53.01, 32.01]] } }]
  setup.updateLiveLabel()
  setup.updateLiveLabel()
  assert.equal(markers.length, 2)
  assert.equal(markers[0].removed, true)
  setup.deactivateAll()
  assert.equal(markers[1].removed, true)
})

test('changing a marker preview refreshes its colour even when the data key is unchanged', async t => {
  const { setup, markers, flushFrames, updateProps } = await mountMap(t, {
    props: { wells: [{ id: '1', _layerUuid: 'a', lat: 32, lng: 53 }], wellsKey: 'same' },
  })
  setup.scheduleRender()
  flushFrames()
  const before = markers.at(-1).element.style.cssText
  await updateProps({ previewOkIds: ['a::1'] })
  flushFrames()
  assert.notEqual(markers.at(-1).element.style.cssText, before)
  assert.match(markers.at(-1).element.style.cssText, /#22c55e/)
})

test('the marker information tool opens a Mapbox popup and cleans it on exit', async t => {
  const { setup, maps, markers, popups, unmount } = await mountMap(t, {
    props: { wells: [{ id: '1', lat: 32, lng: 53 }], selectionTool: 'info' },
  })
  setup.setSelectionToolActive('info')
  setup.renderMarkers(false)
  markers[0].element.dispatchEvent(new Event('click'))
  assert.equal(popups.length, 1)
  assert.equal(popups[0].map, maps[0])
  assert.deepEqual(popups[0].coords, [53, 32])
  unmount()
  assert.equal(popups[0].removed, true)
})

test('changing styles removes old layer handlers before binding replacements', async t => {
  const { setup, maps } = await mountMap(t)
  maps[0].addLayer({ id: 'wells-point' })
  setup.bindWellEventsOnce()
  const before = maps[0].handlers.get('click').size
  setup.applyMapTheme('dark')
  maps[0].addLayer({ id: 'wells-point' })
  setup.bindWellEventsOnce()
  assert.equal(maps[0].handlers.get('click').size, before)
  assert.equal(maps[0].handlers.get('mouseenter').size, 1)
  assert.equal(maps[0].handlers.get('mouseleave').size, 1)
})

test('drawing waits for a ready style and cancellation removes its waiting listener', async t => {
  const { setup, maps, draws } = await mountMap(t)
  maps[0].loaded = false
  setup.activateTool('draw', 'line')
  await settle()
  assert.equal(draws.length, 0)
  assert.equal(maps[0].handlers.get('idle').size, 1)
  setup.deactivateAll()
  assert.equal(maps[0].handlers.get('idle').size, 0)
  maps[0].loaded = true
  maps[0].fire('idle')
  await settle()
  assert.equal(draws.length, 0)
})

test('opening a second information popup removes the first without clearing the new one', async t => {
  const { setup, maps, popups } = await mountMap(t)
  setup.showStackedPopup([{ well: { id: '1' }, fp: { id: '1' } }], [53, 32])
  setup.showStackedPopup([{ well: { id: '2' }, fp: { id: '2' } }], [54, 33])
  assert.equal(popups[0].removed, true)
  assert.equal(popups[1].map, maps[0])
  assert.equal(setup.lastInfoPopup, popups[1])
})

test('a theme change during Mapbox loading is used by the newly created map', async t => {
  const mapGate = deferred()
  const { maps, updateProps } = await mountMap(t, { mapGate })
  await updateProps({ theme: 'dark' })
  mapGate.resolve()
  await settle()
  assert.equal(maps.length, 1)
  assert.match(maps[0].options.style, /dark/)
})

test('failed draw loading resets the active tool and exposes a useful error', async t => {
  const drawGate = deferred()
  const { setup, draws } = await mountMap(t, { drawGate })
  setup.activateTool('draw', 'line')
  await settle()
  drawGate.reject(new Error('test import failure'))
  await settle()
  assert.equal(draws.length, 0)
  assert.equal(setup.activeMode, null)
  assert.match(setup.toolError, /بارگذاری نشد/)
})

test('style waits for highlight and symbology do not accumulate idle callbacks', async t => {
  const {setup,maps}=await mountMap(t)
  maps[0].loaded=false
  for(let i=0;i<5;i++) { setup.updateHighlightData(); setup.updateSymData() }
  assert.equal(maps[0].handlers.get('idle').size,2)
})

test('an empty query result dims only the queried layer', async t => {
  const {setup,maps}=await mountMap(t,{props:{hasFilter:true,filteredLayerUuids:['a'],highlightedIds:[],wells:[
    {id:'1',_layerUuid:'a',_geometry:{type:'Point',coordinates:[53,32]}},
    {id:'1',_layerUuid:'b',_geometry:{type:'Point',coordinates:[54,33]}},
  ]}})
  setup.renderMarkers(false)
  const features=maps[0].getSource('wells-src').data.features
  assert.equal(features.find(f=>f.properties._layerUuid==='a').properties._dimmed,1)
  assert.equal(features.find(f=>f.properties._layerUuid==='b').properties._dimmed,0)
})

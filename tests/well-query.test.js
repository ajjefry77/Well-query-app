import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope } from 'vue'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const layer = uuid => ({ uuid, name: uuid })
let instance = 0

async function setup(t, handlers = {}) {
  const calls = []
  globalThis.__queryTestApi = {
    fetchVectorLayers: async () => [],
    fetchLayerFields: async (uuid, opts) => { calls.push(opts.signal); return handlers.fields?.(uuid, opts) ?? [] },
    fetchAllFeatures: async (uuid, opts) => { calls.push(opts.signal); return handlers.features?.(uuid, opts) ?? [] },
    buildQueryableFields: fields => fields,
    featuresToRows: rows => rows,
  }
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null, setItem() {}, removeItem() {} } })
  const stub = `const api = globalThis.__queryTestApi; export const { fetchVectorLayers, fetchLayerFields, fetchAllFeatures, buildQueryableFields, featuresToRows } = api;`
  const apiUrl = `data:text/javascript;base64,${Buffer.from(stub).toString('base64')}#${instance++}`
  let source = await readFile(new URL('../src/composables/useWellQuery.js', import.meta.url), 'utf8')
  source = source.replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
    .replace("'./useGeoboxApi.js'", JSON.stringify(apiUrl))
  for (const name of ['useGeoUtils.js', 'useSpatialRelations.js']) {
    source = source.replace(`'./${name}'`, JSON.stringify(new URL(`../src/composables/${name}`, import.meta.url).href))
  }
  const { useWellQuery } = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${instance++}`)
  const scope = effectScope()
  const query = scope.run(useWellQuery)
  t.after(() => {
    scope.stop()
    delete globalThis.__queryTestApi
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage)
    else delete globalThis.localStorage
  })
  return { query, calls, scope }
}

test('removing a layer during loading prevents its late response from restoring it', async t => {
  const gate = deferred()
  const { query } = await setup(t, { features: () => gate.promise })
  const pending = query.addLayer(layer('a'))
  query.removeLayer('a')
  gate.resolve([{ id: '1' }])
  await pending
  assert.deepEqual(query.activeLayers.value, [])
  assert.deepEqual(query.layerFeaturesMap.value, {})
  assert.equal(query.apiError.value, null)
})

test('clearing layers invalidates a pending bulk selection', async t => {
  const gate = deferred()
  const { query } = await setup(t, { features: () => gate.promise })
  const pending = query.setActiveLayers([layer('a')])
  query.clearLayers()
  gate.resolve([])
  await pending
  assert.deepEqual(query.activeLayers.value, [])
  assert.equal(query.loadingFeatures.value, false)
})

test('the latest bulk layer selection wins when earlier responses arrive last', async t => {
  const gate = deferred()
  const { query } = await setup(t, { features: uuid => uuid === 'a' ? gate.promise : [] })
  const old = query.setActiveLayers([layer('a')])
  await query.setActiveLayers([layer('b')])
  gate.resolve([])
  await old
  assert.deepEqual(query.activeLayers.value.map(l => l.uuid), ['b'])
  assert.equal(query.apiError.value, null)
})

test('concurrent additions keep loading active until both finish', async t => {
  const gate = deferred()
  const { query } = await setup(t, { features: uuid => uuid === 'a' ? gate.promise : [] })
  const first = query.addLayer(layer('a'))
  await query.addLayer(layer('b'))
  assert.equal(query.loadingFeatures.value, true)
  gate.resolve([])
  await first
  assert.equal(query.loadingFeatures.value, false)
  assert.deepEqual(query.activeLayers.value.map(l => l.uuid).sort(), ['a', 'b'])
})

test('disposing the scope aborts in-flight layer loads and ignores late data', async t => {
  const gate = deferred()
  const { query, scope, calls } = await setup(t, { features: () => gate.promise })
  const pending = query.addLayer(layer('a'))
  scope.stop()
  assert.ok(calls.every(signal => signal.aborted))
  gate.resolve([{ id: '1' }])
  await pending
  assert.deepEqual(query.activeLayers.value, [])
  assert.deepEqual(query.allWells.value, [])
})

test('a failed addition retains the previous layer and committed query', async t => {
  const { query } = await setup(t, { features: uuid => { if (uuid === 'b') throw new Error('unavailable'); return [] } })
  await query.addLayer(layer('a'))
  query.getLayerConditions('a').push({ field: 'name', operator: '=', value: 'well', logic: 'AND' })
  const before = JSON.stringify(query.getLayerConditions('a'))
  await query.addLayer(layer('b'))
  assert.deepEqual(query.activeLayers.value.map(l => l.uuid), ['a'])
  assert.equal(JSON.stringify(query.getLayerConditions('a')), before)
  assert.equal(query.apiError.value, 'unavailable')
})

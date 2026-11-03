import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope } from 'vue'
import { mountHome } from './helpers/home-component.js'

const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }
const layer = uuid => ({ uuid, name: uuid })
let instance = 0

test('selected scope with no selected rows returns no preview or export rows', async t => {
  const { query } = await setup(t, { features: () => [{ id: 1, score: 10 }] })
  await query.addLayer(layer('a'))
  query.attributeScope.value = 'selected'
  assert.equal(query.getLayerResultCount('a'), 0)
  assert.deepEqual(query.computeAttributeRows('a', [], 'selected'), [])
})

test('preview cache tracks selection identity even when its size stays the same', async t => {
  const { query } = await setup(t, { features: () => [{ id: 1, score: 10 }, { id: 2, score: 20 }] })
  await query.addLayer(layer('a'))
  query.getLayerConditions('a').push({ field: 'score', operator: '>', value: 15 })
  query.attributeScope.value = 'selected'
  const rows = query.allWells.value
  query.setSelectionKeys([query.rowKeyOf(rows[0])])
  assert.equal(query.getLayerResultCount('a'), 0)
  query.setSelectionKeys([query.rowKeyOf(rows[1])])
  assert.equal(query.getLayerResultCount('a'), 1)
})

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

test('attribute output includes only queried layers and ignores later drafts', async t => {
  const { query } = await setup(t, { features: () => [{id:1,score:10},{id:2,score:20}] })
  await query.setActiveLayers([layer('a'),layer('b')])
  const conditions = query.getLayerConditions('a')
  conditions.push({field:'score',operator:'>',value:15})
  query.applyAttributeConditions()
  conditions[0].value = 100
  assert.deepEqual(query.combinedResults.value.map(query.rowKeyOf),['a::2'])
  assert.equal(query.getLayerResultCount('a'),0)
  assert.deepEqual(query.captureAttributeQuery().items.map(i=>i.layerUuid),['a'])
})

test('attribute history captures input selection for replay and output', async t => {
  const { query } = await setup(t, { features: () => [{id:1,score:10},{id:2,score:20},{id:3,score:30}] })
  await query.addLayer(layer('a'))
  query.setSelectionKeys(['a::1','a::2'])
  query.attributeScope.value='selected'
  query.getLayerConditions('a').push({field:'score',operator:'>',value:15})
  query.applyAttributeConditions()
  const snapshot=query.captureAttributeQuery()
  query.setSelectionKeys(['a::3'])
  query.clearAllConditions()
  await query.restoreAttributeQuery(snapshot)
  assert.deepEqual(query.combinedResults.value.map(query.rowKeyOf),['a::2'])
  assert.deepEqual(query.computeAttributeRows('a',snapshot.items[0].conditions,snapshot.scope,snapshot.selectionKeys).map(query.rowKeyOf),['a::2'])
  await assert.rejects(query.restoreAttributeQuery({...snapshot,selectionKeys:undefined}),/تاریخچه/)
})

test('AND binds before OR and NOT negates the requested condition', async t => {
  const { query } = await setup(t, {features:()=>[
    {id:1,a:1,b:0,c:0},{id:2,a:0,b:1,c:1},{id:3,a:0,b:1,c:0},
  ]})
  await query.addLayer(layer('a'))
  const conditions=[{field:'a',operator:'=',value:1},{field:'b',operator:'=',value:1,logic:'OR'},
    {field:'c',operator:'=',value:0,logic:'AND',not:true}]
  assert.deepEqual(query.computeAttributeRows('a',conditions).map(r=>r.id),[1,2])
})

test('clearing a pending radius query prevents resurrection', async t => {
  const {query}=await setup(t)
  query.radiusCenter.value={lat:0,lng:0}
  const pending=query.commitSpatialFilter()
  query.clearSpatialFilter()
  assert.equal(await pending,false)
  assert.equal(query.committedRadiusCenter.value,null)
  assert.equal(query.spatialLoading.value,false)
})

test('radius query commits the submitted values and stops on unmount', async t => {
  const {query,scope}=await setup(t)
  query.radiusCenter.value={lat:0,lng:0}
  query.radiusKm.value=1
  const pending=query.commitSpatialFilter()
  query.radiusCenter.value={lat:10,lng:10}
  query.radiusKm.value=2
  assert.equal(await pending,true)
  assert.deepEqual(query.committedRadiusCenter.value,{lat:0,lng:0})
  assert.equal(query.committedRadiusKm.value,1)
  const stopped=query.commitSpatialFilter()
  scope.stop()
  assert.equal(await stopped,false)
  assert.equal(query.committedRadiusKm.value,1)
})

async function relationFixture(t, count=2) {
  const {query,scope}=await setup(t,{features:()=>Array.from({length:count},(_,i)=>({id:i,lat:0,lng:i/100}))})
  await query.setActiveLayers([layer('a'),layer('b')])
  query.relationSourceLayer.value='a'
  query.relationTargetLayer.value='b'
  query.relationOperator.value=['within-distance']
  query.relationRadiusKm.value=1
  return {query,scope}
}

test('relation submission snapshots operators, radius, and selected source/target separately', async t => {
  const {query}=await relationFixture(t)
  query.relationSourceMode.value='selected'
  query.spatialTargetOnlySelected.value=true
  query.setSelectionKeys(['a::0','b::0'])
  const pending=query.commitRelationFilter()
  query.setSelectionKeys(['a::1','b::1'])
  query.relationRadiusKm.value=1000
  query.relationOperator.value=['touches']
  assert.equal(await pending,true)
  assert.deepEqual(query.relationCommitted.value.sourceKeys,['a::0'])
  assert.deepEqual(query.relationCommitted.value.targetKeys,['a::0','b::0'])
  assert.equal(query.relationCommitted.value.radiusKm,1)
  assert.deepEqual(query.combinedResults.value.map(query.rowKeyOf),['b::0'])
  assert.deepEqual(query.computeRelationRows(query.relationCommitted.value).map(query.rowKeyOf),['b::0'])
})

test('clear, cancel, layer removal, and scope disposal invalidate a pending relation', async t => {
  for (const cancel of ['clearRelation','cancelSpatialQuery','removeLayer','dispose']) {
    const {query,scope}=await relationFixture(t)
    const pending=query.commitRelationFilter()
    if (cancel==='dispose') scope.stop()
    else query[cancel]('a')
    assert.equal(await pending,false,cancel)
    assert.equal(query.relationCommitted.value,null,cancel)
    assert.equal(query.spatialLoading.value,false,cancel)
  }
})

test('the latest relation wins and an older completion cannot clear its loading state', async t => {
  const {query}=await relationFixture(t)
  const first=query.commitRelationFilter()
  query.relationRadiusKm.value=3
  const second=query.commitRelationFilter()
  assert.equal(await first,false)
  assert.equal(query.spatialLoading.value,true)
  assert.equal(await second,true)
  assert.equal(query.relationCommitted.value.radiusKm,3)
})

test('selection is pruned when layers are hidden or removed in bulk', async t => {
  const {query}=await relationFixture(t)
  query.setSelectionKeys(['a::0','b::0'])
  query.toggleLayerVisibility('a')
  assert.deepEqual(query.selectedIds.value,['b::0'])
  await query.setActiveLayers([layer('a')])
  assert.equal(query.selectionCount.value,0)
})

test('combined attribute and spatial queries intersect layer-qualified IDs', async t => {
  const {query}=await relationFixture(t)
  query.getLayerConditions('b').push({field:'id',operator:'=',value:1})
  query.applyAttributeConditions()
  assert.equal(await query.commitRelationFilter(),true)
  assert.deepEqual(query.combinedResults.value.map(query.rowKeyOf),['b::1'])
  query.toggleLayerVisibility('b')
  assert.deepEqual(query.combinedResults.value,[])
})

test('history output preserves combined attribute, relation, radius, and source exclusion', async t => {
  const {query}=await relationFixture(t)
  query.getLayerConditions('b').push({field:'id',operator:'=',value:1})
  query.applyAttributeConditions()
  await query.commitRelationFilter()
  query.radiusCenter.value={lat:0,lng:0,_layerUuid:'b',id:0}
  query.radiusKm.value=2
  await query.commitSpatialFilter()
  const radius={center:{...query.committedRadiusCenter.value},radiusKm:query.committedRadiusKm.value}
  const attribute=query.captureAttributeQuery()
  const relation=JSON.parse(JSON.stringify(query.relationCommitted.value))
  const expected=query.combinedResults.value.map(query.rowKeyOf)
  query.setSelectionKeys(['a::0'])
  for(const entry of [{type:'attribute',...attribute,spatial:{radius,relation}}, {type:'relation',params:relation,attribute,radius}]) {
    assert.deepEqual(query.computeHistoryRows(entry).map(query.rowKeyOf),expected)
  }
})

test('NOT and numeric comparisons exclude missing and blank values', async t => {
  const {query}=await setup(t,{features:()=>[{id:1,score:null},{id:2,score:''},{id:3,score:0},{id:4,score:20}]})
  await query.addLayer(layer('a'))
  assert.deepEqual(query.computeAttributeRows('a',[{field:'score',operator:'<',value:1}]).map(r=>r.id),[3])
  assert.deepEqual(query.computeAttributeRows('a',[{field:'score',operator:'>',value:10,not:true}]).map(r=>r.id),[3])
})

test('Home keeps zero-result map filtering active and counts table and history consistently', async t => {
  const {query}=await relationFixture(t)
  const home=await mountHome(t,query)
  query.getLayerConditions('a').push({field:'id',operator:'>',value:10})
  home.onApplyAttribute()
  assert.equal(home.displayRows.length,0)
  assert.equal(home.hasAnyFilter,true)
  assert.deepEqual(home.highlightedIds,[])
  assert.equal(home.allHistoryEntries[0].count,0)
  query.clearSelection()
  assert.deepEqual(home.filteredLayerUuids,['a'])
})

test('Home map sampling retains a rare query match and highlight survives selection changes', async t => {
  const {query}=await setup(t,{features:()=>Array.from({length:9000},(_,id)=>({id,lat:0,lng:0}))})
  await query.addLayer(layer('a'))
  const home=await mountHome(t,query)
  query.getLayerConditions('a').push({field:'id',operator:'=',value:8999})
  home.onApplyAttribute()
  assert.equal(home.displayRows.length,1)
  assert.ok(home.mapWells.some(r=>r.id===8999))
  query.clearSelection()
  assert.deepEqual(home.highlightedIds,['a::8999'])
  assert.deepEqual(home.displayRows.map(query.rowKeyOf),query.computeHistoryRows(home.allHistoryEntries[0]).map(query.rowKeyOf))
})

test('Home history replay restores selected input even after selection is replaced', async t => {
  const {query}=await relationFixture(t)
  const home=await mountHome(t,query)
  query.setSelectionKeys(['a::0'])
  query.attributeScope.value='selected'
  home.onApplyAttribute()
  const entry=home.allHistoryEntries[0]
  query.setSelectionKeys(['b::1'])
  await home.onRerunHistory(entry)
  assert.deepEqual(home.displayRows.map(query.rowKeyOf),['a::0'])
  assert.deepEqual(home.selectedIds,['a::0'])
})

test('optional source layer uses selected sources from all layers', async t => {
  const {query}=await setup(t,{features:uuid=>[{id:1,lat:0,lng:uuid==='a'?0:uuid==='b'?1:1.001}]})
  await query.setActiveLayers([layer('a'),layer('b'),layer('c')])
  query.setSelectionKeys(['a::1','b::1'])
  query.relationSourceMode.value='selected'
  query.relationTargetLayer.value='c'
  query.relationOperator.value=['within-distance']
  query.relationRadiusKm.value=1
  assert.equal(await query.commitRelationFilter(),true)
  assert.deepEqual(query.relationCommitted.value.sourceKeys,['a::1','b::1'])
  assert.deepEqual(query.combinedResults.value.map(query.rowKeyOf),['c::1'])
  assert.deepEqual(query.computeRelationRows(query.relationCommitted.value).map(query.rowKeyOf),['c::1'])
})

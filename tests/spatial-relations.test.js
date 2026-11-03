import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateRelation, findMatchingRowsMulti, findMatchingRowsMultiAsync } from '../src/composables/useSpatialRelations.js'

const point = (x, y) => ({ type: 'Point', coordinates: [x, y] })
const line = coordinates => ({ type: 'LineString', coordinates })
const box = (a, b, c, d) => ({ type: 'Polygon', coordinates: [[[a,b],[c,b],[c,d],[a,d],[a,b]]] })
const row = (id, geometry, layer = 'target') => ({ id, _layerUuid: layer, _geometry: geometry })
const outer = box(0, 0, 10, 10)
const hole = { ...outer, coordinates: [...outer.coordinates, box(3,3,7,7).coordinates[0]] }

for (const [name, source, target, operator, expected] of [
  ['point inside polygon', outer, point(1,1), 'within', true],
  ['point on boundary only touches', outer, point(0,1), 'within', false],
  ['boundary intersects', outer, point(0,1), 'intersects', true],
  ['boundary touches', outer, point(0,1), 'touches', true],
  ['interior does not touch', outer, point(1,1), 'touches', false],
  ['hole excludes point', hole, point(5,5), 'within', false],
  ['target contains source', point(1,1), outer, 'contains', true],
  ['equal polygons', outer, outer, 'identical', true],
  ['adjacent polygons touch', outer, box(10,0,12,2), 'touches', true],
  ['overlapping polygons do not touch', outer, box(9,0,12,2), 'touches', false],
  ['overlapping polygons', outer, box(9,0,12,2), 'overlaps', true],
  ['contained polygon does not overlap', outer, box(1,1,2,2), 'overlaps', false],
  ['crossing lines', line([[0,0],[2,2]]), line([[0,2],[2,0]]), 'intersects', true],
  ['disjoint shapes', outer, point(20,20), 'intersects', false],
  ['polygon surrounding a hole is not within', hole, box(2,2,8,8), 'within', false],
  ['multipart target respects holes', hole, {type:'MultiPolygon',coordinates:[box(4,4,6,6).coordinates]}, 'within', false],
  ['multipart target inside', outer, {type:'MultiPolygon',coordinates:[box(1,1,2,2).coordinates,box(7,7,8,8).coordinates]}, 'within', true],
  ['line through hole is not within', hole, line([[1,5],[9,5]]), 'within', false],
  ['invalid coordinates are not origin', outer, point(null,1), 'intersects', false],
  ['line shortcut across a bend is not within',line([[0,0],[0,2],[2,2]]),line([[0,0],[2,2]]),'within',false],
  ['line covered by connected multipart line', {type:'MultiLineString',coordinates:[[[0,0],[1,0]],[[1,0],[2,0]]]},line([[0,0],[2,0]]),'within',true],
  ['multipart line with interior and boundary portions',outer,{type:'MultiLineString',coordinates:[[[1,1],[2,2]],[[0,1],[0,2]]]},'within',true],
  ['multi point with interior and boundary',outer,{type:'MultiPoint',coordinates:[[0,1],[1,1]]},'within',true],
  ['multi point with boundary only',outer,{type:'MultiPoint',coordinates:[[0,1],[0,2]]},'within',false],
]) {
  test(name, () => assert.equal(evaluateRelation(source, target, operator), expected))
}

test('union deduplicates by layer-qualified identity and sync/async agree', async () => {
  const sources = [row(1, outer, 'source')]
  const targets = [row(1, point(1,1)),row(1,point(2,2),'other'),row(2,point(0,1)),...sources]
  for (const op of ['within','contains','identical','touches','intersects','overlaps',['within','touches']]) {
    const sync = findMatchingRowsMulti(sources, targets, op)
    assert.deepEqual(await findMatchingRowsMultiAsync(sources, targets, op, {chunkTargets:1}), sync)
    if (Array.isArray(op)) assert.deepEqual(sync.map(r=>`${r._layerUuid}:${r.id}`).sort(), ['other:1','target:1','target:2'])
  }
})

test('distance uses nearest geometry, not line or polygon centroid', async () => {
  const targets = [row(1,point(0,0)),row(2,point(3,3))]
  for (const geometry of [line([[-10,0],[1,0]]), box(-10,-1,1,1)]) {
    const sources = [row(1,geometry,'source')]
    assert.deepEqual(findMatchingRowsMulti(sources,targets,'within-distance',{radiusKm:1}),[targets[0]])
    assert.deepEqual(await findMatchingRowsMultiAsync(sources,targets,'within-distance',{radiusKm:1,chunkTargets:1}),[targets[0]])
  }
})

test('async geometry and distance queries abort even during the final yield', async () => {
  for (const operator of ['intersects','within-distance']) {
    const ctrl = new AbortController()
    await assert.rejects(findMatchingRowsMultiAsync([row(1,outer,'source')],[row(2,point(1,1))],operator,{
      radiusKm:1,chunkTargets:1,signal:ctrl.signal,onProgress:()=>ctrl.abort(),
    }),{name:'AbortError'})
  }
})

test('async queries yield inside a large source set even with one target', async () => {
  for(const operator of ['intersects','within-distance']) {
    const ctrl=new AbortController()
    const sources=Array.from({length:2200},(_,id)=>row(id,point(0,0),'source'))
    await assert.rejects(findMatchingRowsMultiAsync(sources,[row(1,point(10,10))],operator,{
      radiusKm:1,signal:ctrl.signal,onProgress:()=>ctrl.abort(),
    }),{name:'AbortError'})
  }
})

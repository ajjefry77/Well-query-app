import { test } from 'node:test'
import assert from 'node:assert/strict'
import { findWithinRadius, haversineDistanceKm, toGeoJSON } from '../src/composables/useGeoUtils.js'
import { rowToFeature } from '../src/composables/useSpatialRelations.js'

test('radius includes a point just inside its spherical north boundary', () => {
  assert.equal(findWithinRadius([{ lat: 1, lng: 0 }], { lat: 0, lng: 0 }, 111.25).length, 1)
})

test('radius crosses the antimeridian and includes polar neighbours', () => {
  assert.equal(findWithinRadius([{ lat: 0, lng: -179.9 }], { lat: 0, lng: 179.9 }, 23).length, 1)
  assert.equal(findWithinRadius([{ lat: 89, lng: 180 }], { lat: 89, lng: 0 }, 223).length, 1)
})

test('missing, blank and out-of-range coordinates never become origin points', () => {
  for (const lat of [null, undefined, '', ' ', 91, NaN]) {
    const row = { lat, lng: 0 }
    assert.deepEqual(findWithinRadius([row], { lat: 0, lng: 0 }, 10), [])
    assert.equal(rowToFeature(row), null)
    assert.equal(toGeoJSON([row]).features.length, 0)
    assert.deepEqual(findWithinRadius([{ lat: 0, lng: 0 }], row, 10), [])
  }
})

test('radius preserves input, sorts distances and accepts numeric coordinates', () => {
  const rows = [{ id: 2, lat: '0', lng: '1' }, { id: 1, lat: 0, lng: 0 }]
  assert.deepEqual(findWithinRadius(rows, { lat: 0, lng: 0 }, 112).map(r => r.id), [1, 2])
  assert.equal(rows[0].distanceKm, undefined)
  assert.ok(Math.abs(haversineDistanceKm(rows[0], rows[1]) - 111.1949266) < 0.000001)
})

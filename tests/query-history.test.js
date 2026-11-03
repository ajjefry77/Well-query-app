import { test } from 'node:test'
import assert from 'node:assert/strict'
import { effectScope, nextTick } from 'vue'
import { useQueryHistory } from '../src/composables/useQueryHistory.js'

function setup(t, stored = []) {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'localStorage')
  const writes=[]
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify(stored),setItem:(key,value)=>writes.push(JSON.parse(value)),removeItem(){}}})
  const scope=effectScope(), history=scope.run(useQueryHistory)
  t.after(()=>{scope.stop(); if(previous) Object.defineProperty(globalThis,'localStorage',previous); else delete globalThis.localStorage})
  return {history,writes}
}

test('history distinguishes identical conditions applied to different input selections', t=>{
  const {history}=setup(t)
  const entry={type:'attribute',scope:'selected',items:[]}
  history.push({...entry,selectionKeys:['a::1']})
  history.push({...entry,selectionKeys:['a::2']})
  assert.equal(history.entries.value.length,2)
  history.push({...entry,selectionKeys:['a::1']})
  assert.equal(history.entries.value.length,2)
})

test('history snapshots nested filters and persists them independently of form edits', async t=>{
  const {history,writes}=setup(t)
  const entry={type:'relation',params:{operator:['within']},attribute:{selectionKeys:['a::1']}}
  history.push(entry)
  entry.params.operator.push('touches')
  entry.attribute.selectionKeys.push('a::2')
  await nextTick()
  assert.deepEqual(history.entries.value[0].params.operator,['within'])
  assert.deepEqual(writes.at(-1)[0].attribute.selectionKeys,['a::1'])
})

test('malformed stored history does not prevent app setup', t=>{
  const {history}=setup(t,{invalid:true})
  assert.deepEqual(history.entries.value,[])
})

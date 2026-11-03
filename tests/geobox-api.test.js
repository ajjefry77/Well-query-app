import { readFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
import { test } from 'node:test'

// Import a fresh API instance with synthetic credentials; never read project env files.
let instance = 0
async function api(t, handler, env = { VITE_API_USER: 'test', VITE_API_PASS: 'test' }) {
  t.mock.method(globalThis, 'fetch', handler)
  const source = await readFile(new URL('../src/composables/useGeoboxApi.js', import.meta.url), 'utf8')
  return import(`data:text/javascript;base64,${Buffer.from(source.replaceAll('import.meta.env', JSON.stringify(env))).toString('base64')}#${instance++}`)
}
const response = (data, status = 200) => new Response(JSON.stringify(data), { status })
const token = (id = 'token') => `${id}.${Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')}.sig`
const auth = (id) => response({ access_token: token(id) })
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r }); return { promise, resolve } }

test('parallel requests share authentication and cache the token', async t => {
  let logins = 0
  const client = await api(t, url => url.endsWith('/auth/token/') ? (logins++, auth()) : response([]))
  await Promise.all([client.fetchLayerFields('a'), client.fetchLayerFields('b')])
  await client.fetchLayerFields('c')
  assert.equal(logins, 1)
})

test('malformed authentication response does not lock future attempts', async t => {
  let logins = 0
  const client = await api(t, url => url.endsWith('/auth/token/')
    ? (++logins === 1 ? new Response('{') : auth()) : response([]))
  await assert.rejects(client.fetchLayerFields('a'))
  assert.deepEqual(await client.fetchLayerFields('a'), [])
  assert.equal(logins, 2)
})

test('missing credentials can be retried without a stuck promise', async t => {
  const client = await api(t, () => assert.fail('fetch must not run'), {})
  await assert.rejects(client.fetchLayerFields('a'), /VITE_API_USER/)
  await assert.rejects(client.fetchLayerFields('a'), /VITE_API_USER/)
})

test('a signal aborted before the call prevents authentication', async t => {
  const client = await api(t, () => assert.fail('fetch must not run'))
  const ctrl = new AbortController()
  ctrl.abort(new Error('user cancelled'))
  await assert.rejects(client.fetchLayerFields('a', { signal: ctrl.signal }), { name: 'AbortError' })
})

test('cancellation while awaiting shared auth prevents the cancelled data request', async t => {
  const gate = deferred()
  const paths = []
  const client = await api(t, url => {
    if (url.endsWith('/auth/token/')) return gate.promise
    paths.push(url)
    return response([])
  })
  const ctrl = new AbortController()
  const cancelled = client.fetchLayerFields('a', { signal: ctrl.signal })
  const active = client.fetchLayerFields('b')
  ctrl.abort()
  await assert.rejects(cancelled, { name: 'AbortError' })
  gate.resolve(auth())
  await active
  assert.equal(paths.length, 1)
  assert.match(paths[0], /\/b\/fields\//)
})

test('abort during response body parsing remains an AbortError', async t => {
  const started = deferred()
  const ctrl = new AbortController()
  const client = await api(t, url => url.endsWith('/auth/token/') ? auth() : {
    ok: true,
    json: async () => { started.resolve(); await new Promise(resolve => ctrl.signal.addEventListener('abort', resolve, { once: true })); throw ctrl.signal.reason },
  })
  const pending = client.fetchLayerFields('a', { signal: ctrl.signal })
  await started.promise
  ctrl.abort(new Error('custom cancellation'))
  await assert.rejects(pending, { name: 'AbortError' })
})

test('401 refreshes once and never loops', async t => {
  let logins = 0, requests = 0
  const client = await api(t, url => url.endsWith('/auth/token/') ? auth(String(++logins)) : (requests++, response({}, 401)))
  await assert.rejects(client.fetchLayerFields('a'), { status: 401 })
  assert.equal(logins, 2)
  assert.equal(requests, 2)
})

test('a successful 401 refresh retries with the new token', async t => {
  let logins = 0
  const headers = []
  const client = await api(t, (url, opts) => {
    if (url.endsWith('/auth/token/')) return auth(String(++logins))
    headers.push(opts.headers.Authorization)
    return headers.length === 1 ? response({}, 401) : response([{ name: 'well' }])
  })
  assert.deepEqual(await client.fetchLayerFields('a'), [{ name: 'well' }])
  assert.equal(logins, 2)
  assert.notEqual(headers[0], headers[1])
})

for (const status of [403, 429, 500]) {
  test(`HTTP ${status} preserves a status code and safe user message`, async t => {
    const client = await api(t, url => url.endsWith('/auth/token/') ? auth() : response({ detail: 'private server detail' }, status))
    await assert.rejects(client.fetchLayerFields('a'), error => error.status === status && !error.message.includes('private server detail'))
  })
}

test('403 feature requests are not retried', async t => {
  let requests = 0
  const client = await api(t, url => url.endsWith('/auth/token/') ? auth() : (requests++, response({}, 403)))
  await assert.rejects(client.fetchAllFeatures('a'), { status: 403 })
  assert.equal(requests, 5)
})

test('vector pagination keeps offsets aligned and returns the final partial page', async t => {
  const offsets = []
  const client = await api(t, url => {
    if (url.endsWith('/auth/token/')) return auth()
    const params = new URL(url, 'https://test.invalid').searchParams
    offsets.push(params.get('skip'))
    return response({ results: params.get('page') === '1' ? [{ id: 1 }, { id: 2 }] : [{ id: 3 }] })
  })
  assert.equal((await client.fetchVectorLayers({ pageSize: 2 })).length, 3)
  assert.deepEqual(offsets, ['0', '2'])
})

test('pagination cap reports an error instead of silently returning incomplete layers', async t => {
  const client = await api(t, url => url.endsWith('/auth/token/') ? auth() : response([{ id: 1 }]))
  await assert.rejects(client.fetchVectorLayers({ pageSize: 1 }), /ناقص/)
})

test('invalid pagination size is rejected before network access', async t => {
  const client = await api(t, () => assert.fail('fetch must not run'))
  await assert.rejects(client.fetchVectorLayers({ pageSize: 0 }), /نامعتبر/)
})

test('feature pagination ignores speculative pages after the first short page', async t => {
  const client = await api(t, url => url.endsWith('/auth/token/') ? auth() : response([
    { id: new URL(url, 'https://test.invalid').searchParams.get('page') },
  ]))
  assert.deepEqual(await client.fetchAllFeatures('a'), [{ id: '1' }])
})

test('feature pagination cap rejects instead of returning a truncated result', async t => {
  const fullPage = Array.from({ length: 2000 }, (_, id) => ({ id }))
  const client = await api(t, url => url.endsWith('/auth/token/') ? auth() : response(fullPage))
  await assert.rejects(client.fetchAllFeatures('a'), /ناقص/)
})

test('authentication times out and allows the next attempt', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  let logins = 0
  const client = await api(t, (url, opts) => {
    if (!url.endsWith('/auth/token/')) return response([])
    if (++logins > 1) return auth()
    return new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true }))
  })
  const pending = client.fetchLayerFields('a')
  const rejected = assert.rejects(pending, /تایم‌اوت/)
  t.mock.timers.tick(20000)
  await rejected
  assert.deepEqual(await client.fetchLayerFields('a'), [])
})

test('data timeout covers reading the response body', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const started = deferred()
  const client = await api(t, (url, opts) => url.endsWith('/auth/token/') ? auth() : {
    ok: true,
    json: () => { started.resolve(); return new Promise((resolve, reject) => opts.signal.addEventListener('abort', () => reject(opts.signal.reason), { once: true })) },
  })
  const pending = client.fetchLayerFields('a')
  const rejected = assert.rejects(pending, /تایم‌اوت/)
  await started.promise
  t.mock.timers.tick(20000)
  await rejected
})

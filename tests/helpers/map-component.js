import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, h, nextTick } from 'vue'

export const deferred = () => {
  let resolve, reject
  const promise = new Promise((r, j) => { resolve = r; reject = j })
  return { promise, resolve, reject }
}
export async function settle() {
  await nextTick()
  await new Promise(setImmediate)
  await nextTick()
}

let instance = 0
export async function mountMap(t, { mapGate, drawGate, props = {} } = {}) {
  const frames = new Map()
  const maps = [], draws = [], markers = [], popups = []
  const events = new EventTarget()
  const canvas = Object.assign(new EventTarget(), { style: {} })
  const container = Object.assign(new EventTarget(), { style: {} })
  const interaction = () => ({ enable() {}, disable() {}, disableRotation() {} })
  class MapMock {
    constructor(options) {
      maps.push(this)
      this.options = options
      this.handlers = new Map()
      this.controls = new Set()
      this.sources = new Map()
      this.layers = new Map()
      this.loaded = true
      this.removed = false
      for (const name of ['dragPan', 'dragRotate', 'touchPitch', 'touchZoomRotate', 'doubleClickZoom']) this[name] = interaction()
    }
    on(name, layerOrHandler, handler) {
      const callback = handler ?? layerOrHandler
      if (!this.handlers.has(name)) this.handlers.set(name, new Set())
      this.handlers.get(name).add(callback)
      return this
    }
    once(name, handler) {
      const wrapped = (...args) => { this.off(name, wrapped); handler(...args) }
      wrapped.original = handler
      return this.on(name, wrapped)
    }
    off(name, layerOrHandler, handler) {
      handler ??= layerOrHandler
      for (const callback of this.handlers.get(name) ?? []) {
        if (callback === handler || callback.original === handler) this.handlers.get(name).delete(callback)
      }
    }
    fire(name, data) { for (const handler of [...(this.handlers.get(name) ?? [])]) handler(data) }
    addControl(control) { this.controls.add(control) }
    hasControl(control) { return this.controls.has(control) }
    removeControl(control) { this.controls.delete(control) }
    getCanvas() { return canvas }
    getContainer() { return container }
    isStyleLoaded() { return this.loaded }
    setStyle() { this.loaded = false; this.sources.clear(); this.layers.clear() }
    getStyle() { return { layers: [...this.layers.values()] } }
    addSource(name, source) { this.sources.set(name, { ...source, setData(data) { this.data = data } }) }
    getSource(name) { return this.sources.get(name) }
    removeSource(name) { this.sources.delete(name) }
    addLayer(layer) { this.layers.set(layer.id, layer) }
    getLayer(id) { return this.layers.get(id) }
    removeLayer(id) { this.layers.delete(id) }
    querySourceFeatures() { return this.liveFeatures ?? [] }
    fitBounds() {}
    setPaintProperty() {}
    setLayoutProperty() {}
    remove() { this.removed = true; this.handlers.clear() }
  }
  class DrawMock {
    constructor() { this.modes = []; draws.push(this) }
    changeMode(mode) { this.modes.push(mode) }
    delete() {}
  }
  class MarkerMock {
    constructor(options) { this.element = options?.element ?? options; this.removed = false; markers.push(this) }
    setLngLat() { return this }
    addTo() { return this }
    remove() { this.removed = true }
  }
  class PopupMock {
    constructor() { this.handlers = new Map(); popups.push(this) }
    setLngLat(coords) { this.coords = coords; return this }
    setHTML() { return this }
    addTo(map) { this.map = map; return this }
    on(event, handler) { this.handlers.set(event, handler); return this }
    getElement() { return null }
    remove() { this.removed = true; this.handlers.get('close')?.() }
  }
  class BoundsMock { extend() {} }
  const key = `__mapComponentTest${instance++}`
  const originals = new Map()
  const replaceGlobal = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable: true, writable: true, value })
  }
  const state = {
    mapGate, drawGate,
    mapbox: { Map: MapMock, Marker: MarkerMock, Popup: PopupMock, NavigationControl: class {}, LngLatBounds: BoundsMock, getRTLTextPluginStatus: () => 'loaded' },
    DrawMock,
  }
  replaceGlobal(key, state)
  let frameId = 0
  replaceGlobal('requestAnimationFrame', callback => { const id = ++frameId; frames.set(id, callback); return id })
  replaceGlobal('cancelAnimationFrame', id => frames.delete(id))
  replaceGlobal('window', events)
  replaceGlobal('document', { querySelector: () => ({}), createElement: () => Object.assign(new EventTarget(), { style: {}, dataset: {}, appendChild() {} }) })
  const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  const mapModule = moduleUrl(`const state = globalThis[${JSON.stringify(key)}]; if (state.mapGate) await state.mapGate.promise; export default state.mapbox;`)
  const drawModule = moduleUrl(`const state = globalThis[${JSON.stringify(key)}]; if (state.drawGate) await state.drawGate.promise; export default state.DrawMock;`)
  const sourceUrl = new URL('../../src/components/MapboxMap.vue', import.meta.url)
  const source = await readFile(sourceUrl, 'utf8')
  const { descriptor } = parse(source)
  let script = compileScript(descriptor, { id: key, genDefaultAs: '__component' }).content
  script = script.replaceAll('import.meta.env', '{}').replace(/(from\s+|import\()(["'])([^"']+)\2/g, (match, prefix, quote, specifier) => {
    const url = specifier === 'mapbox-gl' ? mapModule : specifier === '@mapbox/mapbox-gl-draw' ? drawModule
      : specifier.startsWith('.') ? new URL(specifier, sourceUrl).href : import.meta.resolve(specifier)
    return `${prefix}${JSON.stringify(url)}`
  })
  const component = (await import(moduleUrl(`${script}\n__component.render = () => null; export default __component;`))).default
  const renderer = createRenderer({
    createComment: () => ({}), createElement: () => ({}), createText: () => ({}),
    insert() {}, remove() {}, setText() {}, setElementText() {}, patchProp() {}, parentNode() {}, nextSibling() {},
  })
  const root = {}
  const vnode = h(component, { wells: [], ...props })
  renderer.render(vnode, root)
  let unmounted = false
  const unmount = () => { if (!unmounted) { unmounted = true; renderer.render(null, root) } }
  t.after(() => {
    unmount()
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor)
      else delete globalThis[name]
    }
  })
  await settle()
  return {
    setup: vnode.component.setupState, maps, draws, markers, popups, frames, unmount,
    async updateProps(patch) { Object.assign(vnode.component.props, patch); await settle() },
    flushFrames() { const batch = [...frames.values()]; frames.clear(); for (const callback of batch) callback(0) },
  }
}

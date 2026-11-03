import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import { createRenderer, h, nextTick } from 'vue'

let instance = 0
export async function mountHome(t, query) {
  const key = `__homeTest${instance++}`
  const originals = new Map()
  const replace = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name))
    Object.defineProperty(globalThis, name, { configurable:true, writable:true, value })
  }
  replace(key, query)
  replace('window', Object.assign(new EventTarget(), { innerHeight:900,
    requestIdleCallback:()=>1,
    matchMedia:()=>Object.assign(new EventTarget(), { matches:false }),
  }))
  const moduleUrl = source => `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  const vueUrl = import.meta.resolve('vue')
  const queryUrl = moduleUrl(`export const useWellQuery = () => globalThis[${JSON.stringify(key)}]`)
  const themeUrl = moduleUrl(`import {ref} from ${JSON.stringify(vueUrl)}; export const useTheme=()=>({theme:ref('dark'),toggle(){}})`)
  const routerUrl = moduleUrl(`import {reactive} from ${JSON.stringify(vueUrl)}; const route=reactive({query:{}}); export const useRoute=()=>route; export const useRouter=()=>({replace(){}})`)
  const empty = moduleUrl('export default {}')
  const url = new URL('../../src/views/HomeView.vue', import.meta.url)
  const {descriptor}=parse(await readFile(url,'utf8'))
  let script=compileScript(descriptor,{id:key,genDefaultAs:'__component'}).content
  script=script.replace(/(from\s+|import\()(["'])([^"']+)\2/g,(match,prefix,quote,specifier)=>{
    const resolved=specifier.endsWith('.vue') ? empty
      : specifier.endsWith('/useWellQuery.js') ? queryUrl
      : specifier.endsWith('/useTheme.js') ? themeUrl
      : specifier.includes('/router/') ? routerUrl
      : specifier.startsWith('.') ? new URL(specifier,url).href : import.meta.resolve(specifier)
    return `${prefix}${JSON.stringify(resolved)}`
  })
  const component=(await import(moduleUrl(`${script}\n__component.render=()=>null; export default __component;`))).default
  const renderer=createRenderer({createComment:()=>({}),createElement:()=>({}),createText:()=>({}),insert(){},remove(){},setText(){},setElementText(){},patchProp(){},parentNode(){},nextSibling(){}})
  const root={}, vnode=h(component)
  renderer.render(vnode,root)
  t.after(()=>{
    renderer.render(null,root)
    for(const [name,descriptor] of originals) {
      if(descriptor) Object.defineProperty(globalThis,name,descriptor)
      else delete globalThis[name]
    }
  })
  await nextTick()
  return vnode.component.setupState
}

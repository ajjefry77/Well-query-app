import { reactive, defineComponent, h } from 'vue'
import HomeView from '../views/HomeView.vue'
import NotFound from '../views/NotFound.vue'

const SITE_TITLE = 'واکاوی لایه‌های مکانی'

function parseLocation() {
  const url = new URL(window.location.href)
  return {
    path: url.pathname || '/',
    query: Object.fromEntries(url.searchParams.entries()),
  }
}

function normalizePath(p) {
  if (!p) return '/'
  const clean = p.split('?')[0].split('#')[0]
  if (clean.length > 1) return clean.replace(/\/+$/, '')
  return clean || '/'
}

function buildUrl(path, query = {}) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === '') continue
    qs.set(k, String(v))
  }
  const s = qs.toString()
  return s ? `${path}?${s}` : path
}

export const routes = [
  { path: '/', name: 'home', component: HomeView, meta: { title: SITE_TITLE } },
  // دیپ‌لینک تب‌ها
  { path: '/attribute', redirect: '/?view=attribute' },
  { path: '/spatial', redirect: '/?view=spatial' },
  { path: '/stratigraphy', redirect: '/?view=stratigraphy' },
  // ۴۰۴ — باید آخر باشد
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: NotFound,
    meta: { title: `۴۰۴ | ${SITE_TITLE}` },
  },
]

export const currentRoute = reactive({
  path: normalizePath(window.location.pathname),
  query: Object.fromEntries(new URLSearchParams(window.location.search).entries()),
  params: {},
  name: null,
  matched: null,
})

function matchPath(path) {
  const clean = normalizePath(path)
  const exact = routes.find((r) => r.path === clean)
  if (exact) return { route: exact, params: {} }
  const nf = routes.find((r) => r.path.includes(':pathMatch'))
  return { route: nf, params: { pathMatch: clean.replace(/^\//, '') } }
}

function applyTitle(route) {
  try {
    document.title = route?.meta?.title ?? SITE_TITLE
  } catch {}
}

function syncFromLocation() {
  const { path, query } = parseLocation()
  const clean = normalizePath(path)
  const { route, params } = matchPath(clean)
  if (route?.redirect) {
    const target = typeof route.redirect === 'string' ? route.redirect : route.redirect.path
    const [tp, tq] = target.split('?')
    const nextQuery = { ...Object.fromEntries(new URLSearchParams(tq ?? '').entries()) }
    window.history.replaceState({}, '', buildUrl(tp, nextQuery))
    const m2 = matchPath(tp)
    currentRoute.path = normalizePath(tp)
    currentRoute.query = nextQuery
    currentRoute.params = m2.params
    currentRoute.name = m2.route?.name ?? null
    currentRoute.matched = m2.route ?? null
    applyTitle(m2.route)
    return
  }
  currentRoute.path = clean
  currentRoute.query = query
  currentRoute.params = params
  currentRoute.name = route?.name ?? null
  currentRoute.matched = route ?? null
  applyTitle(route)
}

export function navigate(to, { replace = false } = {}) {
  let path = '/'
  let query = {}
  if (typeof to === 'string') {
    const [p, q] = to.split('?')
    path = normalizePath(p || '/')
    query = Object.fromEntries(new URLSearchParams(q ?? '').entries())
  } else if (to && typeof to === 'object') {
    if (to.path) {
      path = normalizePath(to.path)
      query = { ...(to.query ?? {}) }
    } else if (to.name) {
      const r = routes.find((x) => x.name === to.name)
      path = normalizePath(r?.path ?? '/')
      query = { ...(to.query ?? {}) }
      if (to.params?.pathMatch && path.includes(':pathMatch')) path = `/${to.params.pathMatch}`
    }
  }
  // حل ریدایرکت قبل از push
  const { route: direct } = matchPath(path)
  if (direct?.redirect) {
    const target = typeof direct.redirect === 'string' ? direct.redirect : direct.redirect.path
    return navigate(target, { replace: true })
  }
  const url = buildUrl(path, query)
  try {
    if (replace) window.history.replaceState({}, '', url)
    else window.history.pushState({}, '', url)
  } catch {}
  syncFromLocation()
  try {
    window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' })
  } catch {
    try { window.scrollTo(0, 0) } catch {}
  }
}

export function useRoute() {
  return currentRoute
}

export function useRouter() {
  return {
    push: (to) => navigate(to, { replace: false }),
    replace: (to) => navigate(to, { replace: true }),
    back: () => window.history.back(),
    forward: () => window.history.forward(),
    go: (n) => window.history.go(n),
    currentRoute,
  }
}

export const RouterLink = defineComponent({
  name: 'RouterLink',
  props: {
    to: { type: [String, Object], required: true },
    replace: { type: Boolean, default: false },
  },
  setup(props, { slots }) {
    const onClick = (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
      e.preventDefault()
      navigate(props.to, { replace: props.replace })
    }
    return () => {
      let href = '/'
      if (typeof props.to === 'string') href = props.to
      else if (props.to.path) href = buildUrl(props.to.path, props.to.query ?? {})
      return h('a', { href, onClick }, slots.default?.())
    }
  },
})

export const RouterView = defineComponent({
  name: 'RouterView',
  setup() {
    return () => {
      const comp = currentRoute.matched?.component
      return comp ? h(comp) : null
    }
  },
})

const router = {
  currentRoute,
  routes,
  push: (to) => navigate(to, { replace: false }),
  replace: (to) => navigate(to, { replace: true }),
  back: () => window.history.back(),
  install(app) {
    app.provide('router', router)
    app.provide('route', currentRoute)
    app.component('RouterView', RouterView)
    app.component('RouterLink', RouterLink)
    app.config.globalProperties.$router = router
    app.config.globalProperties.$route = currentRoute
  },
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', syncFromLocation)
  try {
    const saved = sessionStorage.getItem('wqa:redirect')
    if (saved && saved !== '/' && window.location.pathname === '/') {
      sessionStorage.removeItem('wqa:redirect')
      const [sp, sq] = saved.split('?')
      window.history.replaceState({}, '', saved)
      syncFromLocation()
    } else {
      syncFromLocation()
    }
  } catch {
    syncFromLocation()
  }
}

export default router

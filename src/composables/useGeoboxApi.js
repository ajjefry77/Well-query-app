// ===============================
// Geobox API Composable
// ===============================

const API_BASE = (import.meta.env.VITE_API_BASE ?? '/api').replace(/\/$/, '')

let accessToken = null;
let tokenPromise = null;
let tokenExp = 0;

function parseJwtExp(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return (payload.exp ?? 0) * 1000
  } catch { return 0 }
}

// -------------------------------
// گرفتن توکن (با cache و جلوگیری از درخواست موازی)
// -------------------------------
async function getToken() {
  if (accessToken && Date.now() < tokenExp - 60000) return accessToken

  if (tokenPromise) return tokenPromise

  tokenPromise = (async () => {
    const username = import.meta.env.VITE_API_USER
    const password = import.meta.env.VITE_API_PASS

    if (!username || !password) {
      tokenPromise = null
      throw new Error('اطلاعات ورود (VITE_API_USER / VITE_API_PASS) در فایل .env تنظیم نشده است.')
    }

    const formData = new URLSearchParams()
    formData.append('username', username)
    formData.append('password', password)

    let res
    try {
      res = await fetch(`${API_BASE}/auth/token/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData
      })
    } catch {
      tokenPromise = null
      throw new Error('اتصال به سرور برقرار نشد. اینترنت یا VPN را بررسی کنید.')
    }

    if (!res.ok) {
      tokenPromise = null
      if (res.status === 502 || res.status === 504) {
        throw new Error('سرور Geobox در دسترس نیست. چند دقیقه دیگر امتحان کنید.')
      }
      if (res.status === 401 || res.status === 422) {
        throw new Error('نام کاربری یا رمز عبور اشتباه است.')
      }
      throw new Error(`خطای سرور: ${res.status}`)
    }

    const data = await res.json()
    if (!data.access_token) {
      tokenPromise = null
      throw new Error('توکن دریافت نشد.')
    }

    accessToken = data.access_token
    tokenExp = parseJwtExp(accessToken)
    tokenPromise = null
    return accessToken
  })()

  return tokenPromise
}

// -------------------------------
// Fetch مرکزی API
// -------------------------------
const API_TIMEOUT_MS = 20000

export function isAbortError(e) {
  return e?.name === 'AbortError' || e?.code === 20
}

async function apiFetch(path, params = {}, retried = false, opts = {}) {
  const token = await getToken();

  const url = Object.keys(params).length
    ? `${API_BASE}${path}?${new URLSearchParams(params)}`
    : `${API_BASE}${path}`;

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new Error('timeout')), API_TIMEOUT_MS)
  const onAbort = () => controller.abort(opts.signal?.reason)
  opts.signal?.addEventListener?.('abort', onAbort, { once: true })

  let res
  try {
    res = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      signal: controller.signal,
    });
  } catch (e) {
    if (isAbortError(e) && opts.signal?.aborted) throw e
    if (e?.message === 'timeout' || e?.name === 'AbortError') {
      throw new Error('سرور پاسخ نداد (تایم‌اوت). دوباره تلاش کنید.')
    }
    throw new Error('اتصال به سرور برقرار نشد. اینترنت یا VPN را بررسی کنید.')
  } finally {
    clearTimeout(timer)
    opts.signal?.removeEventListener?.('abort', onAbort)
  }

  if (!res.ok) {
    // توکن منقضی شده → توکن را پاک کن و یک بار دیگر تلاش کن
    if (res.status === 401 && !retried) {
      accessToken = null
      tokenExp = 0
      return apiFetch(path, params, true, opts)
    }
    let msg = `HTTP ${res.status}`;
    try {
      const d = await res.json();
      msg = d.detail || d.message || msg;
    } catch {}
    throw new Error(msg);
  }

  return res.json();
}

// ===============================
// API Methods
// ===============================

export async function fetchVectorLayers(opts = {}) {
  // صفحه‌بندی کامل تا سقف معقول، بدون پارامترهای متناقض
  const pageSize = Number(opts.pageSize ?? 100)
  const all = []
  let page = 1
  for (;;) {
    const data = await apiFetch("/vectorLayers/", {
      skip: String((page - 1) * pageSize),
      limit: String(pageSize),
      page: String(page),
      page_size: String(pageSize),
    }, false, opts)
    const items = Array.isArray(data) ? data : (data.results ?? data.data ?? data.items ?? [])
    all.push(...items)
    if (!items.length || items.length < pageSize) break
    page += 1
    if (page > 50) break
  }
  return all
}

export async function fetchLayerFields(layerUuid, opts = {}) {
  return apiFetch(`/vectorLayers/${layerUuid}/fields/`, {}, false, opts);
}

export async function fetchLayerFeatures(layerUuid, opts = {}) {
  return apiFetch(`/vectorLayers/${layerUuid}/features/`, {
    add_to_relationship: "false",
    f: "json",
    quant_factor: "1000",
    skip: String(opts.skip ?? 0),
    limit: String(opts.limit ?? 200),
    skip_geometry: "false",
    return_count: "false",
    select_fields: "[ALL]",
    out_srid: "4326",
    bbox_srid: "4326",
    page: String(opts.page ?? 1),
    page_size: String(opts.pageSize ?? 200),
  }, false, opts);
}

// تلاش برای پیدا کردن یک فیلد مناسب، از بین چند کاندید
function pickField(props, candidates) {
  for (const c of candidates) {
    if (c && props[c] !== undefined && props[c] !== null && props[c] !== '') return props[c]
  }
  return undefined
}

const WELL_NAME_CANDIDATES = ['Name_y', 'WellName', 'Well_Name', 'well_name', 'Name']
const WELL_CODE_CANDIDATES = ['WellName', 'WellCode', 'well_code', 'Code']
const X_CANDIDATES = ['X', 'x', 'Long', 'Longitude']
const Y_CANDIDATES = ['Y', 'y', 'Lat', 'Latitude']

// فیلدهای پیش‌فرض ارتفاع/نام چینه؛ چیزی که کاربر در مدال انتخاب می‌کنه
// فقط به‌عنوان اولویت اول به این لیست اضافه میشه، نه جایگزین کامل اون
const TOP_CANDIDATES  = ['TopHeight', 'Top_Height', 'Top', 'top']
const DOWN_CANDIDATES = ['DownHeight', 'Down_Height', 'Down', 'Base', 'base']
const NAME_CANDIDATES = ['Name_x', 'FormationName', 'Formation', 'LayerName', 'Name']

// همه‌ی صفحات یک لایه — با درخواست‌های موازی دسته‌ای (سریع‌تر از حالت ترتیبی)
export async function fetchAllFeatures(layerUuid, opts = {}) {
  const pageSize = 2000
  const CONCURRENCY = 5
  const MAX_PAGE = 50 // محافظ در برابر حلقه بی‌نهایت

  const sleep = (ms) => new Promise(r => setTimeout(r, ms))
  const fetchPage = async (page, attempt = 0) => {
    try {
      const data = await apiFetch(`/vectorLayers/${layerUuid}/features/`, {
        f: 'json',
        skip: String((page - 1) * pageSize),
        limit: String(pageSize),
        page: String(page),
        page_size: String(pageSize),
        skip_geometry: 'false',
        out_srid: '4326',
        select_fields: '[ALL]',
      }, false, opts)
      return Array.isArray(data)
        ? data
        : (data.features ?? data.results ?? data.data ?? [])
    } catch (e) {
      if (isAbortError(e)) throw e
      if (attempt < 2) {
        await sleep(500 * (attempt + 1))
        return fetchPage(page, attempt + 1)
      }
      throw e
    }
  }

  let page = 1
  const all = []

  while (true) {
    if (opts.signal?.aborted) throw new DOMException('aborted', 'AbortError')
    const pages = []
    for (let i = 0; i < CONCURRENCY && page + i <= MAX_PAGE; i++) {
      pages.push(page + i)
    }
    if (!pages.length) break
    const results = await Promise.all(pages.map(fetchPage))
    let reachedEnd = false
    for (const features of results) {
      all.push(...features)
      if (features.length < pageSize) reachedEnd = true
    }
    if (reachedEnd) break
    page += pages.length
    if (page > MAX_PAGE) break
    if (opts.onProgress) opts.onProgress(all.length)
  }

  return all
}

/**
 * نسخه‌ی پویای fetchStratigraphyData؛ لایه از مدال انتخاب میشه.
 *
 * fieldMap (اختیاری): { topField, downField, nameField } — این‌ها فقط برای اطمینانِ کاربر
 * هستن (تأیید اینکه لایه‌ی درستی انتخاب شده) و روی استخراج داده تاثیر محدودکننده‌ای ندارن؛
 * چون با fallback به نام‌های رایج فیلد ترکیب میشن، کل داده‌ی لایه نمایش داده میشه.
 */
export async function fetchStratigraphyDataFromLayer(layerUuid, fieldMap = {}) {
  const topCandidates  = [fieldMap.topField,  ...TOP_CANDIDATES]
  const downCandidates = [fieldMap.downField, ...DOWN_CANDIDATES]
  const nameCandidates = [fieldMap.nameField, ...NAME_CANDIDATES]

  const features = await fetchAllFeatures(layerUuid)

  // گروه‌بندی بر اساس اسم چاه
  const wellMap = {}

  for (const f of features) {
    const p = f.properties ?? {}

    const wellName  = pickField(p, WELL_NAME_CANDIDATES)
    const wellCode  = pickField(p, WELL_CODE_CANDIDATES)
    const x         = pickField(p, X_CANDIDATES)
    const y         = pickField(p, Y_CANDIDATES)

    const layerName = pickField(p, nameCandidates)        // اسم/نوع چینه
    const top       = Number(pickField(p, topCandidates)) // ارتفاع بالایی
    const base      = Number(pickField(p, downCandidates))// ارتفاع پایینی

    if (!wellName || !layerName) continue
    if (Number.isNaN(top) || Number.isNaN(base)) continue

    const wellKey = `${wellCode ?? ''}::${wellName}`
    if (!wellMap[wellKey]) {
      wellMap[wellKey] = {
        id: String(wellCode ?? wellName),
        name: wellName,
        field: '',
        x: Number(x),
        y: Number(y),
        td: 0,
        formations: []
      }
    }

    // از تکرار لایه جلوگیری کن
    const already = wellMap[wellKey].formations.find(fm => fm.name === layerName)
    if (!already) {
      wellMap[wellKey].formations.push({
        name: layerName,
        top: top,
        base: base
      })
    }
  }

  // مرتب‌سازی لایه‌ها از بالا به پایین و محاسبه TD (عمیق‌ترین کف)
  return Object.values(wellMap)
    .filter(w => Number.isFinite(w.x) && Number.isFinite(w.y))
    .map(well => {
      well.formations.sort((a, b) => b.top - a.top)
      well.td = well.formations.length ? Math.max(...well.formations.map(f => f.base)) : 0
      return well
    })
}

// ===============================
// Helpers (GIS utilities)
// ===============================

function signedRingArea(ring) {
  let a = 0
  for (let i = 0; i + 1 < ring.length; i++) {
    a += (ring[i][0] * ring[i + 1][1] - ring[i + 1][0] * ring[i][1])
  }
  return a / 2
}

function polygonCentroid(ring) {
  if (!ring?.length) return null
  // حذف نقطه تکراری closing برای میانگین وزنی
  const pts = (ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1])
    ? ring.slice(0, -1)
    : ring
  let area2 = 0, cx = 0, cy = 0
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i]
    const [x2, y2] = pts[(i + 1) % pts.length]
    if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) continue
    const cross = x1 * y2 - x2 * y1
    area2 += cross
    cx += (x1 + x2) * cross
    cy += (y1 + y2) * cross
  }
  if (!area2) {
    const sx = pts.reduce((s, c) => s + (Number.isFinite(c[0]) ? c[0] : 0), 0) / pts.length
    const sy = pts.reduce((s, c) => s + (Number.isFinite(c[1]) ? c[1] : 0), 0) / pts.length
    return { lng: sx, lat: sy }
  }
  return { lng: cx / (3 * area2), lat: cy / (3 * area2) }
}

export function mapDatatype(datatype) {
  const dt = (datatype || "").toLowerCase();

  if (["string", "text", "varchar", "char"].includes(dt)) return "string";
  if (
    [
      "long",
      "integer",
      "int",
      "double",
      "float",
      "real",
      "numeric",
      "number",
      "bigint",
    ].includes(dt)
  )
    return "number";
  if (["boolean", "bool"].includes(dt)) return "boolean";
  if (["date", "datetime", "timestamp"].includes(dt)) return "string";

  return "string";
}

export function buildQueryableFields(apiFields) {
  return apiFields.map((f) => ({
    key: f.name,
    label: f.display_name || f.name,
    type: mapDatatype(f.datatype),
    options: f.domain ? Object.values(f.domain) : undefined,
  }));
}

export function extractCentroid(geometry) {
  if (!geometry) return null;

  const type = geometry.type;
  const coords = geometry.coordinates;

  if (type === "Point") return { lng: coords[0], lat: coords[1] };

  if (type === "MultiPoint" && coords.length)
    return { lng: coords[0][0], lat: coords[0][1] };

  if (type === "LineString" && coords.length) {
    const mid = Math.floor(coords.length / 2);
    return { lng: coords[mid][0], lat: coords[mid][1] };
  }

  if (type === "MultiLineString" && coords?.[0]?.length) {
    const line = coords[0];
    const mid = Math.floor(line.length / 2);
    return { lng: line[mid][0], lat: line[mid][1] };
  }

  if (type === "Polygon" && coords?.[0]?.length) {
    return polygonCentroid(coords[0]);
  }

  if (type === "MultiPolygon" && coords?.[0]?.[0]?.length) {
    // بزرگ‌ترین رینگ بیرونی
    let biggest = coords[0][0]
    let maxArea = 0
    for (const poly of coords) {
      const ring = poly?.[0]
      if (!ring?.length) continue
      const a = Math.abs(signedRingArea(ring))
      if (a > maxArea) { maxArea = a; biggest = ring }
    }
    return polygonCentroid(biggest);
  }

  if (type === "GeometryCollection" && geometry.geometries?.length) {
    return extractCentroid(geometry.geometries[0]);
  }

  return null;
}

export function featuresToRows(features) {
  return (features ?? [])
    .filter((f) => f && (f.properties !== undefined || f.id !== undefined || f.fid !== undefined))
    .map((f) => {
      const props = f.properties ?? {};
      const centroid = extractCentroid(f.geometry);

      return {
        ...props,
        id: String(f.id ?? f.fid ?? props.id ?? props.fid ?? crypto.randomUUID()),
        lat: centroid?.lat ?? null,
        lng: centroid?.lng ?? null,
        _geometry: f.geometry ?? null,
      };
    });
}

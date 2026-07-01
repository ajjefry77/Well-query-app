// ===============================
// Geobox API Composable
// ===============================

const API_BASE = '/api'

// UUID لایه چینه‌شناسی
const STRAT_LAYER_UUID = '311ba310-95e6-405d-b044-c33879b9abbd'

let accessToken = null;
let tokenPromise = null;

// -------------------------------
// گرفتن توکن (با cache و جلوگیری از درخواست موازی)
// -------------------------------
async function getToken() {
  if (accessToken) return accessToken

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
    tokenPromise = null
    return accessToken
  })()

  return tokenPromise
}

// -------------------------------
// Fetch مرکزی API
// -------------------------------
async function apiFetch(path, params = {}) {
  const token = await getToken();

  const url = Object.keys(params).length
    ? `${API_BASE}${path}?${new URLSearchParams(params)}`
    : `${API_BASE}${path}`;

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
  });

  if (!res.ok) {
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

export async function fetchVectorLayers() {
  return apiFetch("/vectorLayers/", {
    skip: "0",
    limit: "100",
    page: "1",
    page_size: "100",
  })
}

export async function fetchLayerFields(layerUuid) {
  return apiFetch(`/vectorLayers/${layerUuid}/fields/`);
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
  });
}

export async function fetchStratigraphyData() {
  return fetchStratigraphyDataFromLayer(STRAT_LAYER_UUID)
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

// همه‌ی صفحات یک لایه رو پشت‌سرهم می‌گیره (محدودیت یک درخواست رو دور می‌زنه)
async function fetchAllFeatures(layerUuid) {
  const pageSize = 2000
  let page = 1
  let all = []

  while (true) {
    const data = await apiFetch(`/vectorLayers/${layerUuid}/features/`, {
      f: 'json',
      skip: String((page - 1) * pageSize),
      limit: String(pageSize),
      page: String(page),
      page_size: String(pageSize),
      skip_geometry: 'false',
      out_srid: '4326',
      select_fields: '[ALL]',
    })

    const features = Array.isArray(data)
      ? data
      : (data.features ?? data.results ?? data.data ?? [])

    all = all.concat(features)

    if (features.length < pageSize) break // صفحه آخر
    page += 1
    if (page > 50) break // محافظ در برابر حلقه بی‌نهایت
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

    if (!wellMap[wellName]) {
      wellMap[wellName] = {
        id: String(wellCode ?? wellName),
        name: wellName,
        field: '',
        x: x ?? 0,
        y: y ?? 0,
        td: 0,
        formations: []
      }
    }

    // از تکرار لایه جلوگیری کن
    const already = wellMap[wellName].formations.find(fm => fm.name === layerName)
    if (!already) {
      wellMap[wellName].formations.push({
        name: layerName,
        top: top,
        base: base
      })
    }
  }

  // مرتب‌سازی لایه‌ها از بالا به پایین و محاسبه TD
  return Object.values(wellMap).map(well => {
    well.formations.sort((a, b) => b.top - a.top)
    well.td = well.formations.length ? Math.min(...well.formations.map(f => f.base)) : 0
    return well
  })
}

// ===============================
// Helpers (GIS utilities)
// ===============================

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
    const ring = coords[0];
    const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return { lng, lat };
  }

  if (type === "MultiPolygon" && coords?.[0]?.[0]?.length) {
    const ring = coords[0][0];
    const lng = ring.reduce((s, c) => s + c[0], 0) / ring.length;
    const lat = ring.reduce((s, c) => s + c[1], 0) / ring.length;
    return { lng, lat };
  }

  if (type === "GeometryCollection" && geometry.geometries?.length) {
    return extractCentroid(geometry.geometries[0]);
  }

  return null;
}

export function featuresToRows(features) {
  return features
    .filter((f) => f && (f.properties !== undefined || f.id !== undefined))
    .map((f, i) => {
      const props = f.properties ?? {};
      const centroid = extractCentroid(f.geometry);

      return {
        id: String(f.id ?? f.fid ?? props.id ?? i),
        ...props,
        lat: centroid?.lat ?? null,
        lng: centroid?.lng ?? null,
        _geometry: f.geometry ?? null,
      };
    });
}

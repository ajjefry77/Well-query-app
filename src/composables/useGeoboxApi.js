// ===============================
// Geobox API Composable
// ===============================

const API_BASE = '/api'

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

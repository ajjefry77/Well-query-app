<template>
  <div class="map-shell">
    <div ref="mapEl" class="map-el"></div>
    <div class="map-info" v-if="wells.length">
      <span class="mono">{{ wells.length }} عارضه</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from "vue";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { toGeoJSON } from "../composables/useGeoUtils.js";

const props = defineProps({
  wells: { type: Array, required: true },
  highlightedIds: { type: Array, default: () => [] },
  hasFilter: { type: Boolean, default: false },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, default: 0 },
  selectedId: { type: [String, Number], default: null },
  theme: { type: String, default: "light" },
});
const emit = defineEmits(["select-well"]);

const mapEl = ref(null);
let map = null;
let geoLayer = null;
const featureRefs = new Map();

// ─── تعویض تم نقشه (روشن ↔ تیره) ──────────────────────────
const DARK_TILE_KEY = "تیره 🌙";
const LIGHT_TILE_KEYS = ["توپوگرافی 🗺", "ماهواره‌ای 🛰"];
let tileLayers = null;
let activeTileKey = "توپوگرافی 🗺";
let lastLightTile = "توپوگرافی 🗺";

function switchTile(key) {
  if (!map || !tileLayers || activeTileKey === key) return;
  Object.values(tileLayers).forEach((l) => {
    if (map.hasLayer(l)) map.removeLayer(l);
  });
  tileLayers[key].addTo(map);
  activeTileKey = key;
  map.fire("baselayerchange", { layer: tileLayers[key], name: key });
}

function syncTheme() {
  if (!map || !tileLayers) return;
  const dark = props.theme === "dark";
  if (dark && activeTileKey !== DARK_TILE_KEY) {
    lastLightTile = activeTileKey;
    switchTile(DARK_TILE_KEY);
  } else if (!dark && activeTileKey === DARK_TILE_KEY) {
    switchTile(lastLightTile || "توپوگرافی 🗺");
  }
}

const COLORS = [
  "#c97a4a",
  "#4a9b8e",
  "#d4a546",
  "#8b7bb8",
  "#c0563f",
  "#5b9bd5",
  "#7ec88a",
];
function colorForId(id) {
  let hash = 0;
  for (const ch of String(id)) hash = (hash * 31 + ch.charCodeAt(0)) & 0xffff;
  return COLORS[hash % COLORS.length];
}

// کلید یکتا: شناسه‌ها ممکن است بین لایه‌ها تکراری باشند
function wellKey(w) {
  if (!w) return null;
  const id = w.id ?? w.properties?.id;
  if (id == null || id === "") return null;
  const lu = w._layerUuid ?? w.properties?._layerUuid;
  return lu ? `${lu}::${id}` : String(id);
}
function inHighlightSet(key, highlightSet) {
  if (!key) return false;
  if (highlightSet.has(key)) return true;
  // سازگاری با حالت قدیمی (فقط id بدون لایه)
  const i = key.indexOf("::");
  if (i >= 0 && highlightSet.has(key.slice(i + 2))) return true;
  return false;
}
function hasCoord(w) {
  return Number.isFinite(+w.lat) && Number.isFinite(+w.lng);
}

const GRAY = "#8a9490"
const MATCH_FILL = "#22c55e"
const MATCH_BORDER = "#14532d"

function defaultStyle(feature, highlighted, matched = false) {
  const color = colorForId(feature?.properties?.id ?? "");
  const dimmed = props.hasFilter && !highlighted
  if (matched) {
    return {
      color: MATCH_BORDER,
      weight: 3,
      fillColor: MATCH_FILL,
      fillOpacity: 0.65,
      opacity: 1,
    };
  }
  if (selected) {
    return {
      color: "#f0a500",
      weight: 3.5,
      fillColor: "#f0a500",
      fillOpacity: 0.6,
      opacity: 1,
    };
  }
  return {
    color: dimmed ? GRAY : (highlighted ? "#e9efe9" : color),
    weight: highlighted ? 2.5 : 1.5,
    fillColor: dimmed ? GRAY : color,
    fillOpacity: dimmed ? 0.08 : (highlighted ? 0.55 : 0.25),
    opacity: dimmed ? 0.35 : (highlighted ? 1 : 0.8),
  };
}

function makePointIcon(color, highlighted, dimmed, isCenter = false, matched = false) {
  const size = isCenter ? 20 : (matched ? 18 : (highlighted ? 16 : 10));
  const bg = dimmed ? GRAY : (isCenter ? color : (matched ? MATCH_FILL : color))
  const border = dimmed ? "rgba(120,140,135,0.4)" : (isCenter ? "#fff" : (matched ? MATCH_BORDER : (highlighted ? "#e9efe9" : "rgba(12,18,16,0.6)")))
  const shadow = isCenter
    ? "0 0 0 4px rgba(240,165,0,0.25)"
    : (matched ? "0 0 0 5px rgba(34,197,94,0.35)" : (highlighted ? "0 0 0 4px rgba(240,165,0,0.25)" : "none"))
  const opacity = isCenter ? "1" : (dimmed ? "0.35" : "1")
  return L.divIcon({
    className: "geo-marker",
    html: `<div style="
      width:${size}px;height:${size}px;border-radius:50%;
      background:${bg};
      border:2px solid ${border};
      box-shadow:${shadow};
      opacity:${opacity};
    "></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function renderFeatures(fit = true) {
  if (!geoLayer) return;
  geoLayer.clearLayers();
  featureRefs.clear();

  const highlightSet = new Set((props.highlightedIds || []).map(String));
  const centerKey = wellKey(props.radiusCenter);
  const selectedKey = props.selectedId != null && props.selectedId !== '' ? String(props.selectedId) : null;
  const hasGeometry = props.wells.some((w) => w._geometry);

  if (hasGeometry) {
    const geojson = toGeoJSON(props.wells.filter((w) => w._geometry));

    L.geoJSON(geojson, {
      style: (feature) => {
        const key = wellKey(feature);
        const highlighted = inHighlightSet(key, highlightSet);
        const isCenter = centerKey && key === centerKey;
        const isSel = selectedKey && (key === selectedKey || String(feature.properties.id) === selectedKey);
        if (isSel) {
          return {
            color: "#f0a500",
            weight: 3.5,
            fillColor: "#f0a500",
            fillOpacity: 0.6,
            opacity: 1,
          };
        }
        if (isCenter) {
          return {
            color: "#e74c3c",
            weight: 3,
            fillColor: "#e74c3c",
            fillOpacity: 0.55,
            opacity: 1,
          };
        }
        return defaultStyle(feature, highlighted, highlighted && props.hasFilter);
      },
      pointToLayer: (feature, latlng) => {
        const key = wellKey(feature);
        const highlighted = inHighlightSet(key, highlightSet);
        const dimmed = props.hasFilter && !highlighted
        const matched = highlighted && props.hasFilter
        const isCenter = centerKey && key === centerKey;
        const isSel = selectedKey && (key === selectedKey || String(feature.properties.id) === selectedKey);
        if (isSel) return L.marker(latlng, { icon: makePointIcon("#f0a500", true, false) });
        const color = isCenter ? "#e74c3c" : colorForId(feature.properties.id);
        return L.marker(latlng, { icon: makePointIcon(color, highlighted, dimmed, isCenter, matched) });
      },
      onEachFeature: (feature, layer) => {
        const key = wellKey(feature);
        const well = props.wells.find((w) => wellKey(w) === key)
          ?? props.wells.find((w) => String(w.id) === String(feature.properties.id));
        if (!well) return;

        const props_ = feature.properties;
        const rows = Object.entries(props_)
          .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
          .slice(0, 8)
          .map(
            ([k, v]) =>
              `<tr><td class="wqa-popup__key">${k}</td><td class="wqa-popup__val">${v ?? "—"}</td></tr>`,
          )
          .join("");

        layer.bindPopup(`
          <div class="wqa-popup">
            <div class="wqa-popup__title">عارضه #${well.id}</div>
            <table class="wqa-popup__table">${rows}</table>
          </div>
        `);

        layer.on("click", () => emit("select-well", well));
        const wkey = wellKey(well);
        featureRefs.set(wkey, layer);
        featureRefs.set(String(well.id), layer);
      },
    }).addTo(geoLayer);

    // عوارض بدون ژئومتری (فقط lat/lng) — در حالت ترکیبی هم نمایش داده شوند
    addCoordMarkers(highlightSet, centerKey, selectedKey);

    if (fit) {
      try {
        const bounds = geoLayer.getBounds();
        if (bounds.isValid())
          map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
      } catch {}
    }
  } else {
    props.wells.forEach((w) => {
      if (!hasCoord(w)) return;
      const key = wellKey(w);
      const highlighted = inHighlightSet(key, highlightSet);
      const dimmed = props.hasFilter && !highlighted
      const matched = highlighted && props.hasFilter
      const isCenter = centerKey && key === centerKey
      const isSel = selectedKey && (key === selectedKey || String(w.id) === selectedKey)
      const baseColor = isSel ? "#f0a500" : (isCenter ? "#e74c3c" : colorForId(w.id));
      const color = matched && !isSel && !isCenter ? MATCH_FILL : baseColor;
      const marker = L.circleMarker([+w.lat, +w.lng], {
        radius: isSel ? 9 : (isCenter ? 10 : (matched ? 9 : (highlighted ? 8 : (dimmed ? 4 : 5)))),
        color: dimmed && !isSel ? GRAY : (matched ? MATCH_BORDER : (isSel ? "#1a1a1a" : (isCenter ? "#fff" : (highlighted ? "#e9efe9" : color)))),
        weight: isSel || isCenter || matched ? 3 : 1.5,
        fillColor: dimmed && !isSel ? GRAY : color,
        fillOpacity: dimmed && !isSel ? 0.15 : ((isSel || isCenter || matched) ? 0.9 : (highlighted ? 0.8 : 0.5)),
        opacity: (isSel || isCenter || matched) ? 1 : (dimmed ? 0.35 : 1),
      });
      marker._wellId = key;
      marker.on("click", () => emit("select-well", w));
      marker.addTo(geoLayer);
      featureRefs.set(key, marker);
      featureRefs.set(String(w.id), marker);
    });

    const latlngs = props.wells
      .filter(hasCoord)
      .map((w) => [+w.lat, +w.lng]);
    if (fit && latlngs.length) {
      try {
        map.fitBounds(L.latLngBounds(latlngs), {
          padding: [32, 32],
          maxZoom: 14,
        });
      } catch {}
    }
  }
}

function addCoordMarkers(highlightSet, centerKey, selectedKey) {
  props.wells
    .filter((w) => !w._geometry && hasCoord(w))
    .forEach((w) => {
      const key = wellKey(w);
      const highlighted = inHighlightSet(key, highlightSet);
      const dimmed = props.hasFilter && !highlighted
      const matched = highlighted && props.hasFilter
      const isCenter = centerKey && key === centerKey
      const isSel = selectedKey && (key === selectedKey || String(w.id) === selectedKey)
      const baseColor = isSel ? "#f0a500" : (isCenter ? "#e74c3c" : colorForId(w.id));
      const color = matched && !isSel && !isCenter ? MATCH_FILL : baseColor;
      const marker = L.circleMarker([+w.lat, +w.lng], {
        radius: isSel ? 9 : (isCenter ? 10 : (matched ? 9 : (highlighted ? 8 : (dimmed ? 4 : 5)))),
        color: dimmed && !isSel ? GRAY : (matched ? MATCH_BORDER : (isSel ? "#1a1a1a" : (isCenter ? "#fff" : (highlighted ? "#e9efe9" : color)))),
        weight: isSel || isCenter || matched ? 3 : 1.5,
        fillColor: dimmed && !isSel ? GRAY : color,
        fillOpacity: dimmed && !isSel ? 0.15 : ((isSel || isCenter || matched) ? 0.9 : (highlighted ? 0.8 : 0.5)),
        opacity: (isSel || isCenter || matched) ? 1 : (dimmed ? 0.35 : 1),
      });
      marker._wellId = key;
      marker.on("click", () => emit("select-well", w));
      marker.addTo(geoLayer);
      featureRefs.set(key, marker);
      featureRefs.set(String(w.id), marker);
    });
}

onMounted(() => {
  map = L.map(mapEl.value, {
    center: [32, 53],
    zoom: 5,
    zoomControl: false,
  });

  tileLayers = {
    "توپوگرافی 🗺": L.tileLayer(
      "https://mapiq.ir:3002/api/proxy/mapir/google/vt/lyrs=p&hl=fa&x={x}&y={y}&z={z}",
      { attribution: "Map IR", maxZoom: 19 },
    ),
    "ماهواره‌ای 🛰": L.tileLayer(
      "https://mapiq.ir:3002/api/proxy/mapir/google/vt/lyrs=s&hl=fa&x={x}&y={y}&z={z}",
      { attribution: "Map IR", maxZoom: 19 },
    ),
    [DARK_TILE_KEY]: L.tileLayer(
      "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
      { attribution: "© OpenStreetMap © CARTO", subdomains: "abcd", maxZoom: 19 },
    ),
  };
  activeTileKey = "توپوگرافی 🗺";
  tileLayers["توپوگرافی 🗺"].addTo(map);
  L.control
    .layers(tileLayers, {}, { position: "topright", collapsed: false })
    .addTo(map);

  map.on("baselayerchange", (e) => {
    activeTileKey = e.name;
    if (LIGHT_TILE_KEYS.includes(e.name)) lastLightTile = e.name;
  });
  syncTheme();

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  geoLayer = L.layerGroup().addTo(map);

  renderFeatures();
});

onBeforeUnmount(() => {
  if (map) map.remove();
});

watch(() => props.theme, syncTheme);

function styleSingleLayer(layer, highlightSet, centerKey, selectedKey) {
  const key = layer.feature ? wellKey(layer.feature) : (layer._wellId || null);
  const plainId = layer.feature?.properties?.id ?? (layer._wellId && layer._wellId.includes('::') ? layer._wellId.slice(layer._wellId.indexOf('::') + 2) : layer._wellId);
  if (!key && !plainId) return;
  const hl = inHighlightSet(key, highlightSet);
  const isCenter = centerKey && key === centerKey;
  const isSel = selectedKey && (key === selectedKey || String(plainId) === selectedKey);
  if (isSel) {
    if (layer.setStyle) {
      layer.setStyle({
        color: "#f0a500",
        weight: 3.5,
        fillColor: "#f0a500",
        fillOpacity: 0.6,
        opacity: 1,
      });
    } else if (layer.setIcon) {
      layer.setIcon(makePointIcon("#f0a500", true, false));
    }
  } else if (isCenter) {
    if (layer.setStyle) {
      layer.setStyle({
        color: "#e74c3c",
        weight: 3,
        fillColor: "#e74c3c",
        fillOpacity: 0.55,
        opacity: 1,
      });
    } else if (layer.setIcon) {
      layer.setIcon(makePointIcon("#e74c3c", true, false, true));
    }
  } else if (layer.setStyle) {
    layer.setStyle(defaultStyle(layer.feature, hl, hl && props.hasFilter));
  } else if (layer.setIcon) {
    const dimmed = props.hasFilter && !hl;
    layer.setIcon(makePointIcon(colorForId(plainId ?? ""), hl, dimmed, false, hl && props.hasFilter));
  }
}

function updateHighlightStyles() {
  if (!geoLayer) return
  const highlightSet = new Set((props.highlightedIds || []).map(String))
  const centerKey = wellKey(props.radiusCenter);
  const selectedKey = props.selectedId != null && props.selectedId !== '' ? String(props.selectedId) : null

  geoLayer.eachLayer(layer => {
    // لایه GeoJSON یک گروه است؛ استایل باید روی فرزندها اعمال شود
    if (typeof layer.eachLayer === "function" && !layer.feature && layer._wellId === undefined) {
      layer.eachLayer(child => styleSingleLayer(child, highlightSet, centerKey, selectedKey));
    } else {
      styleSingleLayer(layer, highlightSet, centerKey, selectedKey);
    }
  })
}

watch(() => props.wells, () => renderFeatures(true));
watch(() => props.highlightedIds, updateHighlightStyles);
watch(() => props.hasFilter, updateHighlightStyles);
watch(() => props.radiusCenter, updateHighlightStyles);
watch(() => props.selectedId, updateHighlightStyles);

defineExpose({
  flyTo(lat, lng, zoom = 13) {
    if (map) map.flyTo([lat, lng], zoom, { duration: 0.8 });
  },
  invalidateSize() {
    if (map) map.invalidateSize();
  },
  zoomToFeature(id) {
    const key = String(id);
    const layer = featureRefs.get(key)
      ?? [...featureRefs.entries()].find(([k]) => k === key || k.endsWith("::" + key))?.[1];
    if (!layer || !map) return;
    if (typeof layer.getBounds === "function") {
      map.flyToBounds(layer.getBounds(), {
        padding: [40, 40],
        maxZoom: 15,
        duration: 0.8,
      });
    } else if (typeof layer.getLatLng === "function") {
      map.flyTo(layer.getLatLng(), 13, { duration: 0.8 });
    }
  },
  zoomToLayer(uuid) {
    if (!map) return;
    const feats = props.wells.filter((w) => String(w._layerUuid) === String(uuid));
    if (!feats.length) return;
    const pts = [];
    const walk = (coords) => {
      if (!Array.isArray(coords)) return;
      if (typeof coords[0] === "number") {
        if (Number.isFinite(+coords[0]) && Number.isFinite(+coords[1]))
          pts.push([+coords[1], +coords[0]]);
      } else coords.forEach(walk);
    };
    feats.forEach((w) => {
      if (w._geometry?.type === "GeometryCollection" && Array.isArray(w._geometry.geometries)) {
        w._geometry.geometries.forEach((g) => walk(g?.coordinates));
      } else if (w._geometry?.coordinates) {
        walk(w._geometry.coordinates);
      } else if (Number.isFinite(+w.lat) && Number.isFinite(+w.lng)) {
        pts.push([+w.lat, +w.lng]);
      }
    });
    if (pts.length) {
      try {
        map.flyToBounds(L.latLngBounds(pts), {
          padding: [40, 40],
          maxZoom: 14,
          duration: 0.8,
        });
      } catch {}
    }
  },
  enablePointPicker(callback) {
    if (!map) return;
    map.getContainer().style.cursor = "crosshair";

    const overlay = L.rectangle(map.getBounds().pad(10), {
      color: "transparent",
      fillColor: "transparent",
      fillOpacity: 0,
      interactive: true,
      bubblingMouseEvents: false,
    }).addTo(map);

    overlay.once("click", (e) => {
      map.getContainer().style.cursor = "";
      overlay.remove();

      if (map._pickerMarker) map.removeLayer(map._pickerMarker);
      map._pickerMarker = L.circleMarker([e.latlng.lat, e.latlng.lng], {
        radius: 8,
        color: "#4a9b8e",
        fillColor: "#4a9b8e",
        fillOpacity: 0.9,
        weight: 3,
      }).addTo(map);

      callback({ lat: e.latlng.lat, lng: e.latlng.lng });
    });

    map._pickerOverlay = overlay;
  },
  disablePointPicker() {
    if (!map) return;
    map.getContainer().style.cursor = "";
    if (map._pickerOverlay) {
      map._pickerOverlay.remove();
      map._pickerOverlay = null;
    }
    if (map._pickerMarker) {
      map.removeLayer(map._pickerMarker);
      map._pickerMarker = null;
    }
  },
});
</script>

<style scoped>
.map-shell {
  position: relative;
  width: 100%;
  height: 100%;
  border-radius: var(--radius-lg);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
}
.map-el {
  width: 100%;
  height: 100%;
  background: var(--bg-deep);
}
.map-info {
  position: absolute;
  top: 12px;
  inset-inline-end: 12px;
  z-index: 500;
  background: color-mix(in srgb, var(--bg-panel) 88%, transparent);
  backdrop-filter: blur(8px);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  padding: 6px 12px;
  border-radius: var(--radius-full);
  box-shadow: var(--shadow-sm);
}
</style>
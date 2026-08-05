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
  theme: { type: String, default: "light" },
});
const emit = defineEmits(["select-well"]);

const mapEl = ref(null);
let map = null;
let geoLayer = null;
let radiusLayer = null;
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

const GRAY = "#8a9490"

function defaultStyle(feature, highlighted) {
  const color = colorForId(feature?.properties?.id ?? "");
  const dimmed = props.hasFilter && !highlighted
  return {
    color: dimmed ? GRAY : (highlighted ? "#e9efe9" : color),
    weight: highlighted ? 2.5 : 1.5,
    fillColor: dimmed ? GRAY : color,
    fillOpacity: dimmed ? 0.08 : (highlighted ? 0.55 : 0.25),
    opacity: dimmed ? 0.35 : (highlighted ? 1 : 0.8),
  };
}

function makePointIcon(color, highlighted, dimmed, isCenter = false) {
  const size = isCenter ? 18 : (highlighted ? 16 : 10);
  const bg = dimmed ? GRAY : color
  const border = dimmed ? "rgba(120,140,135,0.4)" : (isCenter ? "#fff" : (highlighted ? "#e9efe9" : "rgba(12,18,16,0.6)"))
  const shadow = (isCenter || highlighted) ? "0 0 0 4px rgba(240,165,0,0.25)" : "none"
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

function renderFeatures() {
  if (!geoLayer) return;
  geoLayer.clearLayers();
  featureRefs.clear();

  const highlightSet = new Set(props.highlightedIds.map(String));
  const centerId = props.radiusCenter?.id ? String(props.radiusCenter.id) : null;
  const hasGeometry = props.wells.some((w) => w._geometry);

  if (hasGeometry) {
    const geojson = toGeoJSON(props.wells.filter((w) => w._geometry));

    L.geoJSON(geojson, {
      style: (feature) => {
        const highlighted = highlightSet.has(String(feature.properties.id));
        const isCenter =
          centerId && String(feature.properties.id) === centerId;
        if (isCenter) {
          return {
            color: "#e74c3c",
            weight: 3,
            fillColor: "#e74c3c",
            fillOpacity: 0.55,
            opacity: 1,
          };
        }
        return defaultStyle(feature, highlighted);
      },
      pointToLayer: (feature, latlng) => {
        const highlighted = highlightSet.has(String(feature.properties.id));
        const dimmed = props.hasFilter && !highlighted
        const isCenter =
          centerId && String(feature.properties.id) === centerId;
        const color = isCenter ? "#e74c3c" : colorForId(feature.properties.id);
        return L.marker(latlng, { icon: makePointIcon(color, highlighted, dimmed, isCenter) });
      },
      onEachFeature: (feature, layer) => {
        const well = props.wells.find(
          (w) => String(w.id) === String(feature.properties.id),
        );
        if (!well) return;

        const props_ = feature.properties;
        const rows = Object.entries(props_)
          .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
          .slice(0, 8)
          .map(
            ([k, v]) =>
              `<tr><td style="color:#9aab9f;padding:2px 8px 2px 0">${k}</td><td>${v ?? "—"}</td></tr>`,
          )
          .join("");

        layer.bindPopup(`
          <div style="font-family:'Vazirmatn',sans-serif;direction:rtl;min-width:200px;max-width:280px">
            <div style="font-weight:700;margin-bottom:6px;font-size:13px">عارضه #${well.id}</div>
            <table style="font-size:12px;line-height:1.8;width:100%">${rows}</table>
          </div>
        `);

        layer.on("click", () => emit("select-well", well));
        featureRefs.set(String(well.id), layer);
      },
    }).addTo(geoLayer);

    try {
      const bounds = geoLayer.getBounds();
      if (bounds.isValid())
        map.fitBounds(bounds, { padding: [32, 32], maxZoom: 14 });
    } catch {}
  } else {
    props.wells.forEach((w) => {
      if (!w.lat || !w.lng) return;
      const highlighted = highlightSet.has(String(w.id));
      const dimmed = props.hasFilter && !highlighted
      const isCenter = centerId && String(w.id) === centerId
      const color = isCenter ? "#e74c3c" : colorForId(w.id);
      const marker = L.circleMarker([w.lat, w.lng], {
        radius: isCenter ? 9 : (highlighted ? 8 : (dimmed ? 4 : 5)),
        color: dimmed ? GRAY : (isCenter ? "#fff" : (highlighted ? "#e9efe9" : color)),
        weight: isCenter ? 3 : 1.5,
        fillColor: dimmed ? GRAY : color,
        fillOpacity: dimmed ? 0.15 : (isCenter ? 0.9 : (highlighted ? 0.8 : 0.5)),
        opacity: isCenter ? 1 : (dimmed ? 0.35 : 1),
      });
      marker.on("click", () => emit("select-well", w));
      marker.addTo(geoLayer);
      featureRefs.set(String(w.id), marker);
    });

    const latlngs = props.wells
      .filter((w) => w.lat && w.lng)
      .map((w) => [w.lat, w.lng]);
    if (latlngs.length) {
      try {
        map.fitBounds(L.latLngBounds(latlngs), {
          padding: [32, 32],
          maxZoom: 14,
        });
      } catch {}
    }
  }
}

function renderRadius() {
  if (!radiusLayer) return;
  radiusLayer.clearLayers();
  if (props.radiusCenter && props.radiusKm > 0) {
    L.circle([props.radiusCenter.lat, props.radiusCenter.lng], {
      radius: props.radiusKm * 1000,
      color: "#4a9b8e",
      weight: 1.5,
      fillColor: "#4a9b8e",
      fillOpacity: 0.07,
      dashArray: "4 4",
    }).addTo(radiusLayer);
    L.marker([props.radiusCenter.lat, props.radiusCenter.lng], {
      icon: L.divIcon({
        className: "",
        html: `<div style="width:14px;height:14px;border-radius:50%;background:#e9efe9;border:3px solid #4a9b8e;"></div>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7],
      }),
    }).addTo(radiusLayer);
  }
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
  radiusLayer = L.layerGroup().addTo(map);

  renderFeatures();
  renderRadius();
});

onBeforeUnmount(() => {
  if (map) map.remove();
});

watch(() => props.theme, syncTheme);

function updateHighlightStyles() {
  if (!geoLayer) return
  const highlightSet = new Set(props.highlightedIds.map(String))
  const centerId = props.radiusCenter?.id ? String(props.radiusCenter.id) : null

  geoLayer.eachLayer(layer => {
    const id = layer.feature?.properties?.id ?? layer.feature?.properties?.id
    if (!id) return
    const hl = highlightSet.has(String(id))
    const isCenter = centerId && String(id) === centerId
    if (isCenter) {
      if (layer.setStyle) {
        layer.setStyle({
          color: "#e74c3c",
          weight: 3,
          fillColor: "#e74c3c",
          fillOpacity: 0.55,
          opacity: 1,
        })
      } else if (layer.setIcon) {
        layer.setIcon(makePointIcon("#e74c3c", true, false, true))
      }
    } else if (layer.setStyle) {
      layer.setStyle(defaultStyle(layer.feature, hl))
    } else if (layer.setIcon) {
      const dimmed = props.hasFilter && !hl
      layer.setIcon(makePointIcon(colorForId(id), hl, dimmed))
    }
  })
}

watch(() => props.highlightedIds, updateHighlightStyles);
watch(() => props.hasFilter, updateHighlightStyles);
watch(() => [props.radiusCenter, props.radiusKm], () => {
  renderRadius();
  updateHighlightStyles();
}, { deep: true });

defineExpose({
  flyTo(lat, lng, zoom = 13) {
    if (map) map.flyTo([lat, lng], zoom, { duration: 0.8 });
  },
  invalidateSize() {
    if (map) map.invalidateSize();
  },
  zoomToFeature(id) {
    const layer = featureRefs.get(String(id));
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
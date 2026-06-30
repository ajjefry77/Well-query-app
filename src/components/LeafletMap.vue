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

const props = defineProps({
  wells: { type: Array, required: true },
  highlightedIds: { type: Array, default: () => [] },
  hasFilter: { type: Boolean, default: false },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, default: 0 },
  neighborPairs: { type: Array, default: () => [] },
});
const emit = defineEmits(["select-well"]);

const mapEl = ref(null);
let map = null;
let geoLayer = null;
let highlightLayer = null;
let radiusLayer = null;
let linesLayer = null;
const featureRefs = new Map();

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

function makePointIcon(color, highlighted, dimmed) {
  const size = highlighted ? 16 : 10;
  const bg = dimmed ? GRAY : color
  const border = dimmed ? "rgba(120,140,135,0.4)" : (highlighted ? "#e9efe9" : "rgba(12,18,16,0.6)")
  const shadow = highlighted ? "0 0 0 4px rgba(233,239,233,0.18)" : "none"
  const opacity = dimmed ? "0.35" : "1"
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

function buildGeoJSON(wells) {
  return {
    type: "FeatureCollection",
    features: wells
      .filter((w) => w._geometry)
      .map((w) => ({
        type: "Feature",
        geometry: w._geometry,
        properties: { ...w, _geometry: undefined },
      })),
  };
}

function renderFeatures() {
  if (!geoLayer) return;
  geoLayer.clearLayers();
  if (highlightLayer) highlightLayer.clearLayers();
  featureRefs.clear();

  const highlightSet = new Set(props.highlightedIds);
  const hasGeometry = props.wells.some((w) => w._geometry);

  if (hasGeometry) {
    const geojson = buildGeoJSON(props.wells);

    L.geoJSON(geojson, {
      style: (feature) => {
        const highlighted = highlightSet.has(String(feature.properties.id));
        return defaultStyle(feature, highlighted);
      },
      pointToLayer: (feature, latlng) => {
        const highlighted = highlightSet.has(String(feature.properties.id));
        const dimmed = props.hasFilter && !highlighted
        const color = colorForId(feature.properties.id);
        return L.marker(latlng, { icon: makePointIcon(color, highlighted, dimmed) });
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
      const color = colorForId(w.id);
      const marker = L.circleMarker([w.lat, w.lng], {
        radius: highlighted ? 8 : (dimmed ? 4 : 5),
        color: dimmed ? GRAY : (highlighted ? "#e9efe9" : color),
        weight: 1.5,
        fillColor: dimmed ? GRAY : color,
        fillOpacity: dimmed ? 0.15 : (highlighted ? 0.8 : 0.5),
        opacity: dimmed ? 0.35 : 1,
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

function renderLines() {
  if (!linesLayer) return;
  linesLayer.clearLayers();
  props.neighborPairs.forEach((pair) => {
    if (!pair.a.lat || !pair.b.lat) return;
    L.polyline(
      [
        [pair.a.lat, pair.a.lng],
        [pair.b.lat, pair.b.lng],
      ],
      { color: "#d4a546", weight: 1.5, opacity: 0.7, dashArray: "3 5" },
    ).addTo(linesLayer);
  });
}

onMounted(() => {
  map = L.map(mapEl.value, {
    center: [32, 53],
    zoom: 5,
    zoomControl: false,
  });

  const tileLayers = {
    "توپوگرافی 🗺": L.tileLayer(
      "https://mapiq.ir:3002/api/proxy/mapir/google/vt/lyrs=p&hl=fa&x={x}&y={y}&z={z}",
      { attribution: "Map IR", maxZoom: 19 },
    ),
    "ماهواره‌ای 🛰": L.tileLayer(
      "https://mapiq.ir:3002/api/proxy/mapir/google/vt/lyrs=s&hl=fa&x={x}&y={y}&z={z}",
      { attribution: "Map IR", maxZoom: 19 },
    ),
  };
  tileLayers["توپوگرافی 🗺"].addTo(map);
  L.control
    .layers(tileLayers, {}, { position: "topright", collapsed: false })
    .addTo(map);

  L.control.zoom({ position: "bottomleft" }).addTo(map);

  geoLayer = L.layerGroup().addTo(map);
  highlightLayer = L.layerGroup().addTo(map);
  radiusLayer = L.layerGroup().addTo(map);
  linesLayer = L.layerGroup().addTo(map);

  renderFeatures();
  renderRadius();
  renderLines();
});

onBeforeUnmount(() => {
  if (map) map.remove();
});

watch(() => props.wells, renderFeatures, { deep: false });

function updateHighlightStyles() {
  if (!geoLayer) return
  const highlightSet = new Set(props.highlightedIds.map(String))
  const hasGeom = props.wells.some(w => w._geometry)

  if (hasGeom) {
    // GeoJSON layers — setStyle روی هر لایه
    geoLayer.eachLayer(layer => {
      const id = layer.feature?.properties?.id
      if (!id) return
      const hl = highlightSet.has(String(id))
      if (layer.setStyle) {
        layer.setStyle(defaultStyle(layer.feature, hl))
      } else if (layer.setIcon) {
        const dimmed = props.hasFilter && !hl
        const color = colorForId(id)
        layer.setIcon(makePointIcon(color, hl, dimmed))
      }
    })
  } else {
    // circleMarker — setStyle
    geoLayer.eachLayer(layer => {
      const id = [...featureRefs.entries()].find(([,l]) => l === layer)?.[0]
      if (!id) return
      const hl = highlightSet.has(id)
      const dimmed = props.hasFilter && !hl
      const well = props.wells.find(w => String(w.id) === id)
      if (!well) return
      const color = colorForId(well.id)
      layer.setStyle({
        radius: hl ? 8 : (dimmed ? 4 : 5),
        color: dimmed ? GRAY : (hl ? '#e9efe9' : color),
        weight: 1.5,
        fillColor: dimmed ? GRAY : color,
        fillOpacity: dimmed ? 0.15 : (hl ? 0.8 : 0.5),
        opacity: dimmed ? 0.35 : 1,
      })
    })
  }
}

watch(() => props.highlightedIds, updateHighlightStyles);
watch(() => props.hasFilter, updateHighlightStyles);
watch(() => [props.radiusCenter, props.radiusKm], renderRadius, { deep: true });
watch(() => props.neighborPairs, renderLines);

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
  fitToWells(wells) {
    if (!map) return;
    setTimeout(() => {
      const hasGeometry = wells.some((w) => w._geometry);
      if (hasGeometry) {
        try {
          const bounds = geoLayer.getBounds();
          if (bounds.isValid()) {
            map.flyToBounds(bounds, {
              padding: [48, 48],
              maxZoom: 14,
              duration: 1,
            });
            return;
          }
        } catch {}
      }
      const latlngs = wells
        .filter((w) => w.lat && w.lng)
        .map((w) => [w.lat, w.lng]);
      if (latlngs.length) {
        map.flyToBounds(L.latLngBounds(latlngs), {
          padding: [48, 48],
          maxZoom: 14,
          duration: 1,
        });
      }
    }, 300);
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
  background: rgba(238, 243, 241, 0.92);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
}
</style>
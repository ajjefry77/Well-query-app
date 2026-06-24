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
import mapboxgl from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";

mapboxgl.accessToken =
  import.meta.env.VITE_MAPBOX_TOKEN ?? "pk.YOUR_TOKEN_HERE";

const props = defineProps({
  wells: { type: Array, required: true },
  highlightedIds: { type: Array, default: () => [] },
  radiusCenter: { type: Object, default: null },
  radiusKm: { type: Number, default: 0 },
  neighborPairs: { type: Array, default: () => [] },
});
const emit = defineEmits(["select-well"]);

const mapEl = ref(null);
let map = null;
let markers = [];

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

function clearMarkers() {
  markers.forEach((m) => m.remove());
  markers = [];
}

function clearWellLayers() {
  ["wells-fill", "wells-line", "wells-polyline", "wells-point"].forEach(
    (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    },
  );
  if (map.getSource("wells-src")) map.removeSource("wells-src");
}

function popupHTML(w, props_) {
  const entries = Object.entries(props_)
    .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
    .slice(0, 8)
    .map(
      ([k, v]) =>
        `<tr><td style="color:#9aab9f;padding:2px 8px 2px 0">${k}</td><td>${v ?? "—"}</td></tr>`,
    )
    .join("");
  return `
    <div style="font-family:'Vazirmatn',sans-serif;direction:rtl;min-width:200px">
      <div style="font-weight:700;margin-bottom:6px;font-size:13px">عارضه #${w.id}</div>
      <table style="font-size:12px;line-height:1.8;width:100%">${entries}</table>
    </div>
  `;
}

function renderMarkers() {
  if (!map) return;
  clearMarkers();
  clearWellLayers();

  const highlightSet = new Set(props.highlightedIds.map(String));
  const hasGeometry = props.wells.some((w) => w._geometry);

  if (hasGeometry) {
    const geojson = buildGeoJSON(props.wells);
    geojson.features.forEach((f) => {
      f.properties._color = colorForId(f.properties.id);
      f.properties._highlighted = highlightSet.has(String(f.properties.id))
        ? 1
        : 0;
    });

    map.addSource("wells-src", { type: "geojson", data: geojson });

    // پلیگان fill
    map.addLayer({
      id: "wells-fill",
      type: "fill",
      source: "wells-src",
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ],
      paint: {
        "fill-color": ["get", "_color"],
        "fill-opacity": ["case", ["==", ["get", "_highlighted"], 1], 0.6, 0.3],
      },
    });

    // پلیگان border
    map.addLayer({
      id: "wells-line",
      type: "line",
      source: "wells-src",
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["Polygon", "MultiPolygon"]],
      ],
      paint: {
        "line-color": ["get", "_color"],
        "line-width": ["case", ["==", ["get", "_highlighted"], 1], 3, 2],
      },
    });

    // پلی‌لاین
    map.addLayer({
      id: "wells-polyline",
      type: "line",
      source: "wells-src",
      filter: [
        "in",
        ["geometry-type"],
        ["literal", ["LineString", "MultiLineString"]],
      ],
      paint: {
        "line-color": ["get", "_color"],
        "line-width": ["case", ["==", ["get", "_highlighted"], 1], 4, 2.5],
        "line-opacity": ["case", ["==", ["get", "_highlighted"], 1], 1, 0.8],
      },
    });

    // نقطه
    map.addLayer({
      id: "wells-point",
      type: "circle",
      source: "wells-src",
      filter: ["in", ["geometry-type"], ["literal", ["Point", "MultiPoint"]]],
      paint: {
        "circle-radius": ["case", ["==", ["get", "_highlighted"], 1], 9, 6],
        "circle-color": ["get", "_color"],
        "circle-stroke-width": 2,
        "circle-stroke-color": [
          "case",
          ["==", ["get", "_highlighted"], 1],
          "#1a1a1a",
          "#ffffff",
        ],
      },
    });

    // کلیک و hover روی همه لایه‌ها
    ["wells-fill", "wells-line", "wells-polyline", "wells-point"].forEach(
      (layerId) => {
        map.on("click", layerId, (e) => {
          const fp = e.features[0].properties;
          const well = props.wells.find((w) => String(w.id) === String(fp.id));
          if (!well) return;
          emit("select-well", well);
          new mapboxgl.Popup({ maxWidth: "280px" })
            .setLngLat(e.lngLat)
            .setHTML(popupHTML(well, fp))
            .addTo(map);
        });
        map.on("mouseenter", layerId, () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", layerId, () => {
          map.getCanvas().style.cursor = "";
        });
      },
    );

    // فیت روی همه geometry ها
    try {
      const bounds = new mapboxgl.LngLatBounds();
      geojson.features.forEach((f) => {
        const g = f.geometry;
        if (g.type === "Point") {
          bounds.extend(g.coordinates);
        } else if (g.type === "MultiPoint") {
          g.coordinates.forEach((c) => bounds.extend(c));
        } else if (g.type === "LineString") {
          g.coordinates.forEach((c) => bounds.extend(c));
        } else if (g.type === "MultiLineString") {
          g.coordinates.forEach((line) =>
            line.forEach((c) => bounds.extend(c)),
          );
        } else if (g.type === "Polygon") {
          g.coordinates[0].forEach((c) => bounds.extend(c));
        } else if (g.type === "MultiPolygon") {
          g.coordinates.forEach((poly) =>
            poly[0].forEach((c) => bounds.extend(c)),
          );
        }
      });
      if (!bounds.isEmpty())
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 800 });
    } catch {}
  } else {
    // fallback: lat/lng ساده
    props.wells.forEach((w) => {
      if (!w.lat || !w.lng) return;
      const isHighlighted = highlightSet.has(String(w.id));
      const color = colorForId(w.id);
      const size = isHighlighted ? 18 : 12;

      const el = document.createElement("div");
      el.style.cssText = `
        width:${size}px;height:${size}px;border-radius:50%;
        background:${color};
        border:${isHighlighted ? "3px solid #1a1a1a" : "2px solid #ffffff"};
        box-shadow:0 2px 6px rgba(0,0,0,0.5);
        cursor:pointer;
        ${isHighlighted ? "outline:3px solid rgba(74,155,142,0.4);outline-offset:2px;" : ""}
      `;

      const entries = Object.entries(w)
        .filter(([k]) => !k.startsWith("_") && k !== "lat" && k !== "lng")
        .slice(0, 8)
        .map(
          ([k, v]) =>
            `<tr><td style="color:#9aab9f;padding:2px 8px 2px 0">${k}</td><td>${v ?? "—"}</td></tr>`,
        )
        .join("");

      const popup = new mapboxgl.Popup({ offset: 14, maxWidth: "280px" })
        .setHTML(`
        <div style="font-family:'Vazirmatn',sans-serif;direction:rtl;min-width:200px">
          <div style="font-weight:700;margin-bottom:6px;font-size:13px">عارضه #${w.id}</div>
          <table style="font-size:12px;line-height:1.8;width:100%">${entries}</table>
        </div>
      `);

      el.addEventListener("click", () => emit("select-well", w));
      const marker = new mapboxgl.Marker(el)
        .setLngLat([w.lng, w.lat])
        .setPopup(popup)
        .addTo(map);
      markers.push(marker);
    });

    const points = props.wells.filter((w) => w.lat && w.lng);
    if (points.length) {
      const bounds = new mapboxgl.LngLatBounds();
      points.forEach((w) => bounds.extend([w.lng, w.lat]));
      map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 800 });
    }
  }
}

function renderRadiusAndLines() {
  if (!map || !map.isStyleLoaded()) return;
  ["radius-fill", "radius-line", "center-point", "neighbor-lines"].forEach(
    (id) => {
      if (map.getLayer(id)) map.removeLayer(id);
    },
  );
  ["radius-src", "center-src", "neighbor-src"].forEach((id) => {
    if (map.getSource(id)) map.removeSource(id);
  });

  if (props.radiusCenter && props.radiusKm > 0) {
    const circle = makeCirclePolygon(props.radiusCenter, props.radiusKm);
    map.addSource("radius-src", {
      type: "geojson",
      data: { type: "Feature", geometry: circle },
    });
    map.addLayer({
      id: "radius-fill",
      type: "fill",
      source: "radius-src",
      paint: { "fill-color": "#4a9b8e", "fill-opacity": 0.08 },
    });
    map.addLayer({
      id: "radius-line",
      type: "line",
      source: "radius-src",
      paint: {
        "line-color": "#4a9b8e",
        "line-width": 1.5,
        "line-dasharray": [2, 2],
      },
    });

    map.addSource("center-src", {
      type: "geojson",
      data: {
        type: "Feature",
        geometry: {
          type: "Point",
          coordinates: [props.radiusCenter.lng, props.radiusCenter.lat],
        },
      },
    });
    map.addLayer({
      id: "center-point",
      type: "circle",
      source: "center-src",
      paint: {
        "circle-radius": 7,
        "circle-color": "#e9efe9",
        "circle-stroke-width": 3,
        "circle-stroke-color": "#4a9b8e",
      },
    });
  }

  if (props.neighborPairs.length) {
    const lines = {
      type: "FeatureCollection",
      features: props.neighborPairs
        .filter((p) => p.a.lat && p.b.lat)
        .map((pair) => ({
          type: "Feature",
          geometry: {
            type: "LineString",
            coordinates: [
              [pair.a.lng, pair.a.lat],
              [pair.b.lng, pair.b.lat],
            ],
          },
        })),
    };
    map.addSource("neighbor-src", { type: "geojson", data: lines });
    map.addLayer({
      id: "neighbor-lines",
      type: "line",
      source: "neighbor-src",
      paint: {
        "line-color": "#d4a546",
        "line-width": 1.5,
        "line-dasharray": [1, 2],
        "line-opacity": 0.7,
      },
    });
  }
}

function makeCirclePolygon(center, radiusKm, points = 64) {
  const coords = [];
  const distanceX =
    radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  const distanceY = radiusKm / 110.574;
  for (let i = 0; i < points; i++) {
    const theta = (i / points) * (2 * Math.PI);
    coords.push([
      center.lng + distanceX * Math.cos(theta),
      center.lat + distanceY * Math.sin(theta),
    ]);
  }
  coords.push(coords[0]);
  return { type: "Polygon", coordinates: [coords] };
}

onMounted(() => {
  map = new mapboxgl.Map({
    container: mapEl.value,
    style: "mapbox://styles/mapbox/light-v11",
    center: [53, 32],
    zoom: 5,
  });
  map.addControl(new mapboxgl.NavigationControl(), "bottom-left");
  map.on("load", () => {
    renderMarkers();
    renderRadiusAndLines();
  });
});

onBeforeUnmount(() => {
  clearMarkers();
  if (map) map.remove();
});

watch(() => props.wells, renderMarkers);
watch(() => props.highlightedIds, renderMarkers);
watch(() => [props.radiusCenter, props.radiusKm], renderRadiusAndLines, {
  deep: true,
});
watch(() => props.neighborPairs, renderRadiusAndLines);

defineExpose({
  flyTo(lat, lng, zoom = 13) {
    if (map) map.flyTo({ center: [lng, lat], zoom, duration: 800 });
  },
  invalidateSize() {
    if (map) map.resize();
  },
  zoomToFeature(id) {
    if (!map) return;
    const well = props.wells.find((w) => String(w.id) === String(id));
    if (!well) return;

    if (well._geometry) {
      const g = well._geometry;
      if (g.type === "Point") {
        map.flyTo({ center: g.coordinates, zoom: 13, duration: 800 });
        return;
      }
      const bounds = new mapboxgl.LngLatBounds();
      if (g.type === "LineString") {
        g.coordinates.forEach((c) => bounds.extend(c));
      } else if (g.type === "MultiLineString") {
        g.coordinates.forEach((line) => line.forEach((c) => bounds.extend(c)));
      } else if (g.type === "Polygon") {
        g.coordinates[0].forEach((c) => bounds.extend(c));
      } else if (g.type === "MultiPolygon") {
        g.coordinates.forEach((poly) =>
          poly[0].forEach((c) => bounds.extend(c)),
        );
      }
      if (!bounds.isEmpty())
        map.fitBounds(bounds, { padding: 60, maxZoom: 15, duration: 800 });
    } else if (well.lat && well.lng) {
      map.flyTo({ center: [well.lng, well.lat], zoom: 13, duration: 800 });
    }
  },
  fitToWells(wells) {
    if (!map) return;
    setTimeout(() => {
      const bounds = new mapboxgl.LngLatBounds();
      wells.forEach((w) => {
        if (!w._geometry) {
          if (w.lat && w.lng) bounds.extend([w.lng, w.lat]);
          return;
        }
        const g = w._geometry;
        if (g.type === "Point") bounds.extend(g.coordinates);
        else if (g.type === "MultiPoint")
          g.coordinates.forEach((c) => bounds.extend(c));
        else if (g.type === "LineString")
          g.coordinates.forEach((c) => bounds.extend(c));
        else if (g.type === "MultiLineString")
          g.coordinates.forEach((l) => l.forEach((c) => bounds.extend(c)));
        else if (g.type === "Polygon")
          g.coordinates[0].forEach((c) => bounds.extend(c));
        else if (g.type === "MultiPolygon")
          g.coordinates.forEach((p) => p[0].forEach((c) => bounds.extend(c)));
      });
      if (!bounds.isEmpty())
        map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: 1000 });
    }, 300);
  },
  enablePointPicker(callback) {
    if (!map) return;
    map.getCanvas().style.cursor = "crosshair";

    // همه لایه‌های wells رو غیرفعال کن تا کلیک بهشون نره
    const wellLayers = [
      "wells-fill",
      "wells-line",
      "wells-polyline",
      "wells-point",
    ];
    wellLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "none");
    });

    const handler = (e) => {
      // لایه‌ها رو برگردون
      wellLayers.forEach((id) => {
        if (map.getLayer(id))
          map.setLayoutProperty(id, "visibility", "visible");
      });
      map.getCanvas().style.cursor = "";
      map.off("click", handler);

      // مارکر نقطه انتخابی
      if (map._pickerMarker) map._pickerMarker.remove();
      const el = document.createElement("div");
      el.style.cssText = `
      width:16px;height:16px;border-radius:50%;
      background:#4a9b8e;
      border:3px solid #fff;
      box-shadow:0 2px 8px rgba(0,0,0,0.4);
      pointer-events:none;
    `;
      map._pickerMarker = new mapboxgl.Marker(el)
        .setLngLat(e.lngLat)
        .addTo(map);

      callback({ lat: e.lngLat.lat, lng: e.lngLat.lng });
    };

    // once کار نمیکنه چون لایه‌ها event رو میخورن — از on+off استفاده کن
    map.on("click", handler);
    map._pickerHandler = handler;
  },
  disablePointPicker() {
    if (!map) return;
    map.getCanvas().style.cursor = "";

    if (map._pickerHandler) {
      map.off("click", map._pickerHandler);
      map._pickerHandler = null;
    }

    if (map._pickerMarker) {
      map._pickerMarker.remove();
      map._pickerMarker = null;
    }

    // مطمئن شو لایه‌ها visible هستن
    const wellLayers = [
      "wells-fill",
      "wells-line",
      "wells-polyline",
      "wells-point",
    ];
    wellLayers.forEach((id) => {
      if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", "visible");
    });
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
  background: rgba(255, 255, 255, 0.9);
  backdrop-filter: blur(6px);
  border: 1px solid var(--border-subtle);
  color: var(--text-muted);
  font-size: 11px;
  padding: 5px 10px;
  border-radius: var(--radius-sm);
}
</style>

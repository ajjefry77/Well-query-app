import { ref, computed } from "vue";
import { findWithinRadius, findNeighborPairs } from "./useGeoUtils.js";
import {
  fetchVectorLayers,
  fetchLayerFields,
  fetchLayerFeatures,
  buildQueryableFields,
  featuresToRows,
} from "./useGeoboxApi.js";

// ارزیابی یک شرط واحد روی یک feature
function evaluateCondition(row, condition) {
  const { field, operator, value } = condition;
  const rowValue = row[field];

  if (rowValue === null || rowValue === undefined) return false;

  switch (operator) {
    case "=":
      return String(rowValue) === String(value);
    case "!=":
      return String(rowValue) !== String(value);
    case ">":
      return Number(rowValue) > Number(value);
    case ">=":
      return Number(rowValue) >= Number(value);
    case "<":
      return Number(rowValue) < Number(value);
    case "<=":
      return Number(rowValue) <= Number(value);
    case "contains":
      return String(rowValue)
        .toLowerCase()
        .includes(String(value).toLowerCase());
    default:
      return false;
  }
}

function evaluateGroup(row, conditions) {
  if (!conditions.length) return true;

  let result = evaluateCondition(row, conditions[0]);
  if (conditions[0].not) result = !result;

  for (let i = 1; i < conditions.length; i++) {
    const cond = conditions[i];
    let condResult = evaluateCondition(row, cond);
    if (cond.not) condResult = !condResult;

    if (cond.logic === "OR") {
      result = result || condResult;
    } else {
      result = result && condResult;
    }
  }
  return result;
}

export function useWellQuery() {
  // ---- وضعیت لایه وکتور ----
  const vectorLayers = ref([]);
  const selectedLayer = ref(null);
  const layerFields = ref([]);
  const queryableFields = ref([]);
  const allFeatures = ref([]);
  const allWells = computed(() => allFeatures.value);

  // وضعیت بارگذاری
  const loadingLayers = ref(false);
  const loadingFields = ref(false);
  const loadingFeatures = ref(false);
  const apiError = ref(null);

  // ---- دریافت لیست لایه‌ها ----
  async function loadVectorLayers() {
    loadingLayers.value = true;
    apiError.value = null;
    try {
      vectorLayers.value = await fetchVectorLayers();
    } catch (e) {
      apiError.value = e.message;
    } finally {
      loadingLayers.value = false;
    }
  }

  // ---- انتخاب لایه و بارگذاری فیلد و feature ----
  async function selectLayer(layer) {
    selectedLayer.value = layer;
    layerFields.value = [];
    queryableFields.value = [];
    allFeatures.value = [];
    conditions.value = [];
    apiError.value = null;

    // فیلدها
    loadingFields.value = true;
    try {
      const fields = await fetchLayerFields(layer.uuid);
      layerFields.value = fields;
      queryableFields.value = buildQueryableFields(fields);
      // یه شرط پیش‌فرض اضافه می‌کنیم
      if (queryableFields.value.length > 0) {
        const firstField = queryableFields.value[0];
        conditions.value = [
          {
            field: firstField.key,
            operator: firstField.type === "number" ? ">" : "=",
            value: "",
            logic: "AND",
            not: false,
          },
        ];
      }
    } catch (e) {
      apiError.value = e.message;
    } finally {
      loadingFields.value = false;
    }

    // feature ها
    loadingFeatures.value = true;
    try {
      const data = await fetchLayerFeatures(layer.uuid, {
        pageSize: 200,
        limit: 200,
      });
      const raw = Array.isArray(data)
        ? data
        : (data.features ?? data.results ?? data.data ?? []);
      allFeatures.value = featuresToRows(raw);
    } catch (e) {
      apiError.value = e.message;
    } finally {
      loadingFeatures.value = false;
    }
  }

  // ---- کوئری توصیفی ----
  const conditions = ref([]);

  const attributeResults = computed(() => {
    if (!conditions.value.length) return allFeatures.value;
    // اگه همه شرط‌ها مقدار خالی دارن، همه نتایج نمایش بده
    const activeConditions = conditions.value.filter(
      (c) => c.value !== "" && c.value !== null && c.value !== undefined,
    );
    if (!activeConditions.length) return allFeatures.value;
    return allFeatures.value.filter((row) =>
      evaluateGroup(row, activeConditions),
    );
  });

  function addCondition() {
    const firstField = queryableFields.value[0];
    conditions.value.push({
      field: firstField?.key ?? "",
      operator: "=",
      value: "",
      logic: "AND",
      not: false,
    });
  }

  function removeCondition(index) {
    conditions.value.splice(index, 1);
  }

  // ---- کوئری مکانی: شعاع ----
  const radiusCenter = ref(null);
  const radiusKm = ref(3);

  const radiusResults = computed(() => {
    if (!radiusCenter.value) return [];
    return findWithinRadius(
      allFeatures.value.filter((f) => {
        if (!f.lat || !f.lng) return false;
        // اگه radiusCenter یه عارضه‌ست، خودش رو حذف کن
        if (radiusCenter.value.id !== undefined)
          return f.id !== radiusCenter.value.id;
        return true;
      }),
      radiusCenter.value,
      radiusKm.value,
    );
  });

  // ---- کوئری مکانی: همجواری ----
  // neighborField: اسم فیلدی که می‌خوایم روی آن گروه‌بندی کنیم
  // neighborValue: مقدار آن فیلد که عارضه‌ها رو فیلتر می‌کنه
  const neighborField = ref("");
  const neighborValue = ref("");
  const neighborMaxKm = ref(2);

  const neighborResults = computed(() => {
    if (!neighborField.value) return [];
    // فیلتر عارضه‌ها: فقط اونایی که مختصات دارن
    // اگه neighborValue انتخاب شده، فقط اون دسته رو نشون بده
    const candidates = allFeatures.value.filter((f) => {
      if (!f.lat || !f.lng) return false;
      if (neighborValue.value) {
        return String(f[neighborField.value]) === String(neighborValue.value);
      }
      return true;
    });
    return findNeighborPairs(candidates, neighborMaxKm.value);
  });

  // ---- کوئری‌های ذخیره‌شده ----
  const savedQueries = ref([]);

  function saveCurrentQuery(name) {
    if (!selectedLayer.value) return;
    savedQueries.value.push({
      id: Date.now(),
      name,
      type: "attribute",
      layerUuid: selectedLayer.value.uuid,
      layerName: selectedLayer.value.display_name || selectedLayer.value.name,
      conditions: JSON.parse(JSON.stringify(conditions.value)),
    });
  }

  function loadSavedQuery(query) {
    conditions.value = JSON.parse(JSON.stringify(query.conditions));
  }

  function deleteSavedQuery(id) {
    savedQueries.value = savedQueries.value.filter((q) => q.id !== id);
  }

  return {
    // لایه‌ها
    vectorLayers,
    selectedLayer,
    layerFields,
    queryableFields,
    loadingLayers,
    loadingFields,
    loadingFeatures,
    apiError,
    loadVectorLayers,
    selectLayer,
    // داده
    allWells,
    // کوئری توصیفی
    conditions,
    attributeResults,
    addCondition,
    removeCondition,
    // کوئری مکانی
    radiusCenter,
    radiusKm,
    radiusResults,
    neighborField,
    neighborValue,
    neighborMaxKm,
    neighborResults,
    // ذخیره‌سازی
    savedQueries,
    saveCurrentQuery,
    loadSavedQuery,
    deleteSavedQuery,
  };
}

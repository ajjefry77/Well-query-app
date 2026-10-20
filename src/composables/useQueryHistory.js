import { ref, computed, watch } from 'vue'

// ─── تاریخچه اجرای کوئری‌ها (توصیفی + رابطه مکانی) ─────────
// هر بار که کاربر «اجرای کوئری» می‌زند یک رکورد از پارامترهای کوئری ذخیره می‌شود
// تا بعداً با دکمه «اجرای مجدد» دوباره اجرا شود و در TOC بتوان نتیجه‌اش را
// به‌صورت Shapefile خروجی گرفت.
// روی localStorage هم ذخیره می‌شود تا بعد از رفرش صفحه هم در دسترس باشد.

const LS_KEY = 'wqa:queryHistory'
const MAX_ENTRIES = 40

function lsGet(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw !== null ? JSON.parse(raw) : fallback
  } catch { return fallback }
}

function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// امضای یک کوئری برای تشخیص تکراری (اجرای دوباره همان کوئری به‌جای رکورد جدید، بالای لیست می‌رود)
function entrySignature(entry) {
  if (entry.type === 'attribute') {
    return '__attribute__|' + (entry.scope ?? 'all') + '|' + JSON.stringify(entry.items ?? [])
  }
  return '__relation__|' + JSON.stringify(entry.params ?? {})
}

export function useQueryHistory() {
  const entries = ref(
    (lsGet(LS_KEY, []) ?? []).filter(e => e && typeof e.type === 'string' && typeof e.id === 'string')
  )

  watch(entries, val => lsSet(LS_KEY, val), { deep: true })

  function push(entry) {
    const record = {
      id: crypto.randomUUID(),
      at: Date.now(),
      count: 0,
      ...entry,
    }
    const sig = entrySignature(record)
    // اجرای دوباره همان کوئری → رکورد قبلی حذف و تا بالای لیست بیاید
    const rest = entries.value.filter(e => entrySignature(e) !== sig)
    entries.value = [record, ...rest].slice(0, MAX_ENTRIES)
    return record
  }

  function remove(id) {
    entries.value = entries.value.filter(e => e.id !== id)
  }

  function clear() {
    entries.value = []
  }

  const attributeEntries = computed(() => entries.value.filter(e => e.type === 'attribute'))
  const relationEntries = computed(() => entries.value.filter(e => e.type === 'relation'))

  return { entries, attributeEntries, relationEntries, push, remove, clear }
}

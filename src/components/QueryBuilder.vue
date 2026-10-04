<template>
  <div class="qb">
    <div class="qb__header">
      <h3>کوئری‌ساز توصیفی</h3>
      <span class="qb__count mono">
        {{ resultCount }} / {{ totalCount }} نتیجه
      </span>
    </div>

    <p class="qb__hint" v-if="fields.length">
      فیلدهای لایه را ترکیب کنید تا رکوردهای مورد نظر را فیلتر کنید
    </p>
    <p class="qb__hint" v-else>
      پس از انتخاب لایه، فیلدهای قابل کوئری نمایش داده می‌شوند
    </p>

    <div class="qb__conditions" v-if="fields.length">
      <div v-for="(cond, index) in conditions" :key="index" class="condition-row">
        <div class="condition-row__logic" v-if="index > 0">
          <button
            class="logic-toggle"
            :class="{ 'logic-toggle--or': cond.logic === 'OR' }"
            @click="cond.logic = cond.logic === 'AND' ? 'OR' : 'AND'"
          >
            {{ cond.logic === 'OR' ? 'یا' : 'و' }}
          </button>
        </div>

        <div class="condition-row__body">
          <button
            class="not-toggle"
            :class="{ 'not-toggle--active': cond.not }"
            @click="cond.not = !cond.not"
            title="معکوس کردن شرط (NOT)"
          >
            NOT
          </button>

          <!-- انتخاب فیلد -->
          <AppSelect
            class="qb-select"
            :model-value="cond.field"
            :options="fieldOptions"
            @update:model-value="onFieldChange(cond, $event)"
          />

          <!-- عملگر -->
          <AppSelect
            class="qb-select qb-select--op"
            :model-value="cond.operator"
            :options="operatorOptionsFor(cond.field)"
            @update:model-value="cond.operator = $event"
          />

          <!-- ورودی مقدار -->
          <AppSelect
            v-if="fieldMeta(cond.field)?.type === 'enum' && fieldMeta(cond.field)?.options?.length"
            class="qb-select"
            :model-value="cond.value"
            :options="enumOptionsFor(cond.field)"
            placeholder="— انتخاب کنید —"
            @update:model-value="cond.value = $event"
          />
          <AppSelect
            v-else-if="fieldMeta(cond.field)?.type === 'boolean'"
            class="qb-select"
            :model-value="cond.value"
            :options="booleanOptions"
            @update:model-value="cond.value = $event"
          />
          <template v-else-if="fieldMeta(cond.field)?.type === 'number'">
            <input
              v-model="cond.value"
              type="number"
              class="qb-input mono"
              placeholder="مقدار عددی…"
            />
            <span v-if="rangeHint(cond.field)" class="qb-range mono">{{ rangeHint(cond.field) }}</span>
          </template>
          <div v-else class="qb-autocomplete">
            <input
              :value="cond.value"
              @input="onTextInput(cond, $event.target.value, index)"
              @focus="onTextFocus(index, cond)"
              @blur="onTextBlur()"
              @keydown="onSuggestKeydown($event, index, cond)"
              type="text"
              class="qb-input qb-input--suggest"
              placeholder="مقدار متنی… تایپ کنید برای جستجو"
              autocomplete="off"
            />
            <div v-if="openSuggestIndex === index && suggestItems.length" class="qb-suggest" role="listbox">
              <button
                v-for="(s, si) in suggestItems"
                :key="si"
                type="button"
                class="qb-suggest__item"
                :class="{ 'qb-suggest__item--active': si === activeSuggestIndex }"
                @mousedown.prevent="pickSuggestion(cond, s)"
                @mouseenter="activeSuggestIndex = si"
                :title="s"
              >
                <span class="qb-suggest__text">{{ s }}</span>
              </button>
            </div>
            <div
              v-else-if="openSuggestIndex === index && (cond.value ?? '') !== ''"
              class="qb-suggest"
            >
              <div class="qb-suggest__empty">موردی یافت نشد</div>
            </div>
          </div>

          <button
            class="remove-btn"
            @click="$emit('remove', index)"
            :disabled="conditions.length === 1"
            title="حذف شرط"
          >
            ×
          </button>
        </div>
      </div>
    </div>

    <button class="add-condition-btn" @click="$emit('add')" :disabled="!fields.length">
      + افزودن شرط
    </button>

    <div class="qb__save">
      <input
        v-model="saveName"
        type="text"
        placeholder="نام برای ذخیره این کوئری…"
        class="qb-input qb-input--full"
      />
      <button
        class="save-btn"
        :disabled="!saveName.trim() || !fields.length"
        @click="handleSave"
      >
        ذخیره
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import AppSelect from './AppSelect.vue'

const props = defineProps({
  conditions: { type: Array, required: true },
  fields: { type: Array, required: true },   // queryableFields از API
  fieldStats: { type: Object, default: () => ({}) }, // { fieldKey: { min, max } | null }
  fieldValues: { type: Object, default: () => ({}) }, // { fieldKey: string[] } مقادیر یکتا برای auto-search
  resultCount: { type: Number, required: true },
  totalCount: { type: Number, default: 0 }
})
const emit = defineEmits(['add', 'remove', 'save'])

const saveName = ref('')

const booleanOptions = [
  { value: 'true', label: 'بله' },
  { value: 'false', label: 'خیر' },
]

const fieldOptions = computed(() =>
  props.fields.map((f) => ({ value: f.key, label: f.label }))
)

function operatorOptionsFor(fieldKey) {
  return operatorsFor(fieldKey).map((op) => ({ value: op, label: opLabel(op) }))
}

function enumOptionsFor(fieldKey) {
  return (fieldMeta(fieldKey)?.options ?? []).map((opt) => ({ value: opt, label: opt }))
}

function fieldMeta(key) {
  return props.fields.find((f) => f.key === key) ?? null
}

// بازه مقادیر موجود فیلد عددی (min تا max) برای راهنمای کاربر
function rangeHint(fieldKey) {
  const s = props.fieldStats?.[fieldKey]
  if (!s || !Number.isFinite(s.min) || !Number.isFinite(s.max)) return ''
  const fmt = (n) => Number(n).toLocaleString('fa-IR', { maximumFractionDigits: 4 })
  return `بازه: ${fmt(s.min)} تا ${fmt(s.max)}`
}

function operatorsFor(fieldKey) {
  const meta = fieldMeta(fieldKey)
  if (!meta) return ['=', '!=']
  if (meta.type === 'enum' || meta.type === 'boolean') return ['=', '!=']
  if (meta.type === 'number') return ['=', '!=', '>', '>=', '<', '<=']
  return ['=', '!=', 'contains']
}

const opLabels = {
  '=': 'برابر است با',
  '!=': 'برابر نیست با',
  '>': 'بیشتر از',
  '>=': 'بیشتر یا مساوی',
  '<': 'کمتر از',
  '<=': 'کمتر یا مساوی',
  contains: 'شامل'
}
function opLabel(op) {
  return opLabels[op] || op
}

// وقتی فیلد عوض می‌شه، عملگر را تنظیم کن
function onFieldChange(cond, value) {
  cond.field = value
  const meta = fieldMeta(cond.field)
  cond.operator = meta?.type === 'number' ? '>' : '='
  // مقدار فقط وقتی ریست می‌شود که نوع فیلد از قبل عدد نبود
  const prevMeta = fieldMeta(cond._lastField)
  if (prevMeta && prevMeta.type !== meta?.type) {
    cond.value = ''
  }
  cond._lastField = cond.field
  closeSuggest()
}

// ─── auto-search فیلدهای متنی ───
// لیست مقادیر یکتای هر فیلد از HomeView می‌آید؛ اینجا فقط فیلتر می‌شود (عین سرچ)
const openSuggestIndex = ref(-1)
const activeSuggestIndex = ref(-1)
const suggestItems = ref([])
let blurTimer = null

function distinctFor(fieldKey) {
  const arr = props.fieldValues?.[fieldKey]
  return Array.isArray(arr) ? arr : []
}

function buildSuggest(fieldKey, text) {
  const all = distinctFor(fieldKey)
  if (!all.length) return []
  const q = String(text ?? '').trim().toLowerCase()
  if (!q) return all.slice(0, 20)
  const out = []
  for (const v of all) {
    if (String(v).toLowerCase().includes(q)) {
      out.push(v)
      if (out.length >= 20) break
    }
  }
  return out
}

function onTextInput(cond, val, index) {
  cond.value = val
  openSuggestIndex.value = index
  activeSuggestIndex.value = -1
  suggestItems.value = buildSuggest(cond.field, val)
}

function onTextFocus(index, cond) {
  if (blurTimer) { clearTimeout(blurTimer); blurTimer = null }
  openSuggestIndex.value = index
  activeSuggestIndex.value = -1
  suggestItems.value = buildSuggest(cond.field, cond.value)
}

function onTextBlur() {
  if (blurTimer) clearTimeout(blurTimer)
  blurTimer = setTimeout(() => {
    openSuggestIndex.value = -1
    activeSuggestIndex.value = -1
  }, 150)
}

function closeSuggest() {
  if (blurTimer) { clearTimeout(blurTimer); blurTimer = null }
  openSuggestIndex.value = -1
  activeSuggestIndex.value = -1
}

function pickSuggestion(cond, val) {
  cond.value = val
  closeSuggest()
}

function onSuggestKeydown(e, index, cond) {
  if (openSuggestIndex.value !== index) return
  const n = suggestItems.value.length
  if (e.key === 'ArrowDown' && n) {
    e.preventDefault()
    activeSuggestIndex.value = activeSuggestIndex.value < n - 1 ? activeSuggestIndex.value + 1 : 0
  } else if (e.key === 'ArrowUp' && n) {
    e.preventDefault()
    activeSuggestIndex.value = activeSuggestIndex.value > 0 ? activeSuggestIndex.value - 1 : n - 1
  } else if (e.key === 'Enter' && activeSuggestIndex.value >= 0 && suggestItems.value[activeSuggestIndex.value] != null) {
    e.preventDefault()
    pickSuggestion(cond, suggestItems.value[activeSuggestIndex.value])
  } else if (e.key === 'Escape') {
    closeSuggest()
  }
}

function handleSave() {
  if (!saveName.value.trim()) return
  emit('save', saveName.value.trim())
  saveName.value = ''
}
</script>

<style scoped>
.qb {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.qb__header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}
.qb__header h3 {
  margin: 0;
  font-size: 13px;
  font-weight: 700;
  color: var(--text-primary);
}
.qb__count {
  font-size: 11.5px;
  color: var(--text-secondary);
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-xs);
  padding: 1px 8px;
  direction: ltr;
}
.qb__hint {
  margin: -6px 0 0;
  font-size: 12px;
  color: var(--text-muted);
  line-height: 1.6;
}

.qb__conditions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.condition-row {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.condition-row__logic {
  display: flex;
  justify-content: center;
}
.logic-toggle {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-secondary);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 14px;
  border-radius: var(--radius-xs);
  transition: border-color var(--dur-fast) var(--ease-out);
}
.logic-toggle:hover {
  border-color: var(--brand);
  color: var(--brand);
}
.logic-toggle--or {
  color: var(--accent-amber);
  border-color: var(--accent-amber);
}

.condition-row__body {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-sm);
  padding: 8px;
  flex-wrap: wrap;
  transition: border-color var(--dur-fast) var(--ease-out);
}
.condition-row__body:focus-within {
  border-color: var(--brand);
}

.not-toggle {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  padding: 5px 8px;
  border-radius: var(--radius-xs);
  flex-shrink: 0;
}
.not-toggle:hover:not(.not-toggle--active) {
  border-color: var(--accent-danger);
  color: var(--accent-danger);
}
.not-toggle--active {
  background: var(--accent-danger);
  border-color: var(--accent-danger);
  color: #fff;
}

.qb-select {
  flex: 1;
  min-width: 80px;
}
.qb-input {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 12px;
  padding: 7px 8px;
  border-radius: var(--radius-xs);
  flex: 1;
  min-width: 80px;
}
.qb-select:focus,
.qb-input:focus {
  outline: none;
  border-color: var(--brand);
}
.qb-select--op {
  flex: 1.2;
  min-width: 105px;
}
.qb-range {
  flex-basis: 100%;
  font-size: 10.5px;
  color: var(--text-muted);
  direction: rtl;
  line-height: 1.6;
}
.qb-input--full {
  flex: 1;
  width: 100%;
}

/* ─── auto-search فیلد متنی ─── */
.qb-autocomplete {
  position: relative;
  flex: 1;
  min-width: 80px;
  display: flex;
}
.qb-input--suggest {
  width: 100%;
  flex: 1;
}
.qb-suggest {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  left: 0;
  z-index: 50;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-md);
  max-height: 180px;
  overflow-y: auto;
  padding: 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.qb-suggest__item {
  display: flex;
  align-items: center;
  text-align: start;
  background: transparent;
  border: none;
  border-radius: var(--radius-xs);
  padding: 6px 8px;
  font-size: 12px;
  font-family: inherit;
  color: var(--text-secondary);
  cursor: pointer;
  width: 100%;
}
.qb-suggest__item:hover,
.qb-suggest__item--active {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.qb-suggest__text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  direction: rtl;
}
.qb-suggest__empty {
  padding: 8px;
  text-align: center;
  font-size: 11.5px;
  color: var(--text-muted);
}

.remove-btn {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-xs);
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
  transition: all var(--dur-fast) var(--ease-out);
}
.remove-btn:hover:not(:disabled) {
  border-color: var(--accent-danger);
  color: var(--accent-danger);
  background: color-mix(in srgb, var(--accent-danger) 8%, transparent);
}
.remove-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.add-condition-btn {
  align-self: flex-start;
  background: var(--bg-panel);
  border: 1px dashed var(--border-strong);
  color: var(--brand);
  font-size: 12px;
  font-weight: 600;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
}
.add-condition-btn:hover:not(:disabled) {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.add-condition-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.qb__save {
  display: flex;
  gap: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.save-btn {
  background: var(--brand);
  color: #fff;
  font-weight: 700;
  font-size: 12px;
  border: 1px solid var(--brand-strong);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  flex-shrink: 0;
}
.save-btn:hover:not(:disabled) {
  background: var(--brand-strong);
}
.save-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>

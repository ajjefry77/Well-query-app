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
          <select v-model="cond.field" class="qb-select" @change="onFieldChange(cond)">
            <option v-for="f in fields" :key="f.key" :value="f.key">
              {{ f.label }}
            </option>
          </select>

          <!-- عملگر -->
          <select v-model="cond.operator" class="qb-select qb-select--op">
            <option v-for="op in operatorsFor(cond.field)" :key="op" :value="op">
              {{ opLabel(op) }}
            </option>
          </select>

          <!-- ورودی مقدار -->
          <select
            v-if="fieldMeta(cond.field)?.type === 'enum' && fieldMeta(cond.field)?.options?.length"
            v-model="cond.value"
            class="qb-select"
          >
            <option value="">— انتخاب کنید —</option>
            <option v-for="opt in fieldMeta(cond.field).options" :key="opt" :value="opt">
              {{ opt }}
            </option>
          </select>
          <select
            v-else-if="fieldMeta(cond.field)?.type === 'boolean'"
            v-model="cond.value"
            class="qb-select"
          >
            <option value="true">بله</option>
            <option value="false">خیر</option>
          </select>
          <input
            v-else-if="fieldMeta(cond.field)?.type === 'number'"
            v-model="cond.value"
            type="number"
            class="qb-input mono"
            placeholder="مقدار عددی…"
          />
          <input
            v-else
            v-model="cond.value"
            type="text"
            class="qb-input"
            placeholder="مقدار متنی…"
          />

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
import { ref } from 'vue'

const props = defineProps({
  conditions: { type: Array, required: true },
  fields: { type: Array, required: true },   // queryableFields از API
  resultCount: { type: Number, required: true },
  totalCount: { type: Number, default: 0 }
})
const emit = defineEmits(['add', 'remove', 'save'])

const saveName = ref('')

function fieldMeta(key) {
  return props.fields.find((f) => f.key === key) ?? null
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

// وقتی فیلد عوض می‌شه، عملگر و مقدار رو ریست کن
function onFieldChange(cond) {
  const meta = fieldMeta(cond.field)
  cond.value = ''
  if (meta?.type === 'number') cond.operator = '>'
  else cond.operator = '='
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
  font-size: 14px;
  font-weight: 700;
}
.qb__count {
  font-size: 11.5px;
  color: var(--accent-depth);
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
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--accent-depth);
  font-size: 11px;
  font-weight: 700;
  padding: 3px 14px;
  border-radius: 20px;
}
.logic-toggle--or {
  color: var(--accent-amber);
}

.condition-row__body {
  display: flex;
  align-items: center;
  gap: 6px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 8px;
  flex-wrap: wrap;
}

.not-toggle {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 10px;
  font-weight: 700;
  padding: 5px 8px;
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.not-toggle--active {
  background: var(--accent-danger);
  border-color: var(--accent-danger);
  color: #fff;
}

.qb-select,
.qb-input {
  background: var(--bg-input);
  border: 1px solid var(--border-strong);
  color: var(--text-primary);
  font-size: 12px;
  padding: 7px 8px;
  border-radius: var(--radius-sm);
  flex: 1;
  min-width: 80px;
}
.qb-select--op {
  flex: 1.2;
  min-width: 105px;
}
.qb-input--full {
  flex: 1;
  width: 100%;
}

.remove-btn {
  background: transparent;
  border: 1px solid var(--border-strong);
  color: var(--text-muted);
  width: 28px;
  height: 28px;
  border-radius: var(--radius-sm);
  font-size: 16px;
  line-height: 1;
  flex-shrink: 0;
}
.remove-btn:hover:not(:disabled) {
  border-color: var(--accent-danger);
  color: var(--accent-danger);
}
.remove-btn:disabled {
  opacity: 0.3;
  cursor: not-allowed;
}

.add-condition-btn {
  align-self: flex-start;
  background: transparent;
  border: 1px dashed var(--border-strong);
  color: var(--accent-depth);
  font-size: 12.5px;
  padding: 7px 14px;
  border-radius: var(--radius-sm);
}
.add-condition-btn:hover:not(:disabled) {
  border-color: var(--accent-depth);
  background: rgba(74, 155, 142, 0.08);
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
  background: var(--accent-copper);
  color: #0c1210;
  font-weight: 700;
  font-size: 12.5px;
  border: none;
  padding: 8px 14px;
  border-radius: var(--radius-sm);
  white-space: nowrap;
  flex-shrink: 0;
}
.save-btn:hover:not(:disabled) {
  background: var(--accent-copper-bright);
}
.save-btn:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>

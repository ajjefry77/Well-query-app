<template>
  <aside class="thematic-panel" dir="rtl">
    <h2>نقشه‌های موضوعی</h2>
    <p>لایه‌های مورد نیاز را از «مدیریت لایه‌ها» اضافه کنید، سپس شیوه نمایش هر لایه را تنظیم کنید. همه لایه‌های نمایان روی نقشه مشترک هم‌پوشانی دارند.</p>
    <label>لایه موضوعی
      <select v-model="uuid"><option value="">انتخاب لایه</option><option v-for="l in layers" :key="l.uuid" :value="String(l.uuid)">{{ l.display_name || l.name }}</option></select>
    </label>
    <label>عنوان و هدف نقشه <textarea :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" rows="3" maxlength="120" placeholder="مثلاً بررسی فشار مخزن یا پراکندگی سازندها"></textarea></label>
    <button :disabled="!uuid" class="primary" @click="$emit('configure', uuid)">تنظیم کارتوگرافی لایه</button>
    <p>در تنظیمات، فیلد، روش طبقه‌بندی، طیف رنگ، شفافیت و نماد را انتخاب کنید. راهنمای رنگ‌ها روی نقشه نمایش داده می‌شود.</p>
    <ul>
      <li>مقادیر یکتا: نمایش سازندها و دسته‌بندی‌ها</li>
      <li>رنگ‌های مدرج و پیوسته: مقایسه مقادیر عددی</li>
      <li>نمادهای مدرج و متناسب: مقایسه نقاط</li>
      <li>نقشه حرارتی: نمایش تراکم نقاط</li>
    </ul>
    <h3>لایه‌های موضوعی فعال</h3>
    <p v-if="!entries.length">هنوز رنگ‌بندی موضوعی اعمال نشده است.</p>
    <div v-for="entry in entries" :key="entry.uuid" class="entry">
      <strong>{{ entry.name }}</strong>
      <span>{{ entry.items.length.toLocaleString('fa-IR') }} مورد در راهنما</span>
      <button @click="$emit('configure', entry.uuid)">ویرایش</button>
      <button @click="$emit('reset', entry.uuid)">بازنشانی نماد</button>
    </div>
  </aside>
</template>
<script setup>
import { ref, watch } from 'vue'
const props = defineProps({ layers: { type: Array, default: () => [] }, entries: { type: Array, default: () => [] }, modelValue: { type: String, default: '' } })
defineEmits(['configure', 'reset', 'update:modelValue'])
const uuid = ref('')
watch(() => props.layers, layers => { if (!layers.some(l => String(l.uuid) === uuid.value)) uuid.value = '' })
</script>
<style scoped>
.thematic-panel { width: 310px; min-width: 250px; flex-shrink: 0; overflow-y: auto; padding: 18px; background: var(--bg-panel); color: var(--text-primary); border-inline-end: 1px solid var(--border-subtle); }
h2 { font-size: 16px; margin-top: 0; } h3 { font-size: 14px; }
p, li { font-size: 12px; line-height: 2; color: var(--text-muted); } ul { padding-inline-start: 18px; }
label { display: flex; flex-direction: column; gap: 6px; font-size: 12px; margin: 15px 0; }
select, textarea, button { padding: 9px; font: inherit; color: var(--text-primary); background: var(--bg-input, var(--bg-panel)); border: 1px solid var(--border-subtle); border-radius: 7px; min-width: 0; } textarea { resize: vertical; } button { cursor: pointer; font-size: 12px; } button:disabled { opacity: .5; cursor: default; } .primary { background: var(--brand); color: white; width: 100%; }
.entry { display: flex; flex-wrap: wrap; gap: 8px; padding: 12px 0; border-top: 1px solid var(--border-subtle); font-size: 12px; }.entry strong, .entry span { width: 100%; }
@media(max-width:760px) { .thematic-panel { position: absolute; bottom: 0; inset-inline: 0; width: auto; height: var(--sheet-h, 42vh); max-height: none; padding: 64px 18px 18px; z-index: 30; border-top: 1px solid var(--border-subtle); } }
</style>

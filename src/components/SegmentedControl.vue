<template>
  <div class="sc" :class="`sc--${size}`">
    <button
      v-for="opt in options"
      :key="opt.value"
      class="sc__btn"
      :class="{ 'sc__btn--active': modelValue === opt.value }"
      type="button"
      :aria-pressed="modelValue === opt.value"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true },
  size: { type: String, default: 'md' }, // 'md' | 'sm'
})
defineEmits(['update:modelValue'])

</script>

<style scoped>
.sc {
  position: relative;
  display: flex;
  gap: 2px;
  background: var(--bg-panel-raised);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}
.sc__btn {
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 12.5px;
  padding: 6px 14px;
  border-radius: 5px;
  font-weight: 600;
  cursor: pointer;
  white-space: nowrap;
  transition: color var(--dur-fast) var(--ease-out);
}
.sc__btn:hover:not(.sc__btn--active) {
  color: var(--text-primary);
}
.sc__btn--active {
  color: var(--brand);
  font-weight: 700;
  background: var(--bg-panel);
  box-shadow: var(--shadow-xs), inset 0 0 0 1px var(--border-subtle);
}

/* واریانت کوچک (سوییچ نقشه و CRS) */
.sc--sm .sc__btn {
  font-family: var(--font-mono);
  font-size: 11.5px;
  padding: 6px 12px;
  direction: ltr;
}

@media (max-width: 760px) {
  .sc--md .sc__btn {
    flex: 1;
    padding: 7px 6px;
    font-size: 12px;
  }
}
@media (max-width: 520px) {
  .sc--sm .sc__btn {
    padding: 5px 9px;
    font-size: 10.5px;
  }
}
</style>

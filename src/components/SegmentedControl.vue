<template>
  <div ref="el" class="sc" :class="[`sc--${size}`, { 'sc--ready': thumbReady }]">
    <span
      class="sc__thumb"
      :style="thumbStyle"
      aria-hidden="true"
    ></span>
    <button
      v-for="opt in options"
      :key="opt.value"
      ref="btns"
      class="sc__btn"
      :class="{ 'sc__btn--active': modelValue === opt.value }"
      @click="$emit('update:modelValue', opt.value)"
    >
      {{ opt.label }}
    </button>
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: String, required: true },
  options: { type: Array, required: true },
  size: { type: String, default: 'md' }, // 'md' | 'sm'
})
defineEmits(['update:modelValue'])

const el         = ref(null)
const btns       = ref([])
const thumbReady = ref(false)
const thumbStyle = ref({ transform: 'translateX(0px)', width: '0px', opacity: 0 })

function positionThumb() {
  const host = el.value
  if (!host) return
  const idx = props.options.findIndex(o => o.value === props.modelValue)
  const btn = btns.value[idx]
  if (!btn) return
  const cRect = host.getBoundingClientRect()
  const bRect = btn.getBoundingClientRect()
  thumbStyle.value = {
    transform: `translateX(${bRect.left - cRect.left - (host.clientLeft || 0)}px)`,
    width: `${bRect.width}px`,
    opacity: 1,
  }
  thumbReady.value = true
}

watch(() => props.modelValue, async () => {
  await nextTick()
  positionThumb()
})

watch(() => props.options, async () => {
  await nextTick()
  positionThumb()
})

onMounted(() => {
  positionThumb()
  window.addEventListener('resize', positionThumb)
})
onBeforeUnmount(() => {
  window.removeEventListener('resize', positionThumb)
})
</script>

<style scoped>
.sc {
  position: relative;
  display: flex;
  gap: 4px;
  background: var(--bg-input);
  padding: 4px;
  border-radius: var(--radius-full);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}
.sc__thumb {
  position: absolute;
  top: 4px;
  bottom: 4px;
  left: 0;
  width: 0;
  border-radius: var(--radius-full);
  background: linear-gradient(
    180deg,
    var(--bg-panel),
    color-mix(in srgb, var(--bg-panel) 88%, var(--accent-depth) 7%)
  );
  box-shadow:
    var(--shadow-sm),
    inset 0 0 0 1px color-mix(in srgb, var(--accent-depth) 25%, transparent),
    inset 0 1px 0 color-mix(in srgb, #ffffff 35%, transparent);
  z-index: 0;
  pointer-events: none;
  will-change: transform, width;
  transition: none;
}
.sc--ready .sc__thumb {
  transition:
    transform 0.45s cubic-bezier(0.34, 1.2, 0.64, 1),
    width 0.45s cubic-bezier(0.34, 1.2, 0.64, 1);
}
.sc__btn {
  position: relative;
  z-index: 1;
  background: transparent;
  border: none;
  color: var(--text-secondary);
  font-size: 13px;
  padding: 7px 16px;
  border-radius: var(--radius-full);
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
  transition: color 0.2s var(--ease-out);
}
.sc__btn:hover:not(.sc__btn--active) {
  color: var(--text-primary);
}
.sc__btn--active {
  color: var(--accent-depth);
  font-weight: 700;
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

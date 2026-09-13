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
  gap: 2px;
  background: var(--bg-panel-raised);
  padding: 3px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-subtle);
  overflow: hidden;
}
.sc__thumb {
  position: absolute;
  top: 3px;
  bottom: 3px;
  left: 0;
  width: 0;
  border-radius: 5px;
  background: var(--bg-panel);
  box-shadow: var(--shadow-xs), inset 0 0 0 1px var(--border-subtle);
  z-index: 0;
  pointer-events: none;
  will-change: transform, width;
  transition: none;
}
.sc--ready .sc__thumb {
  transition:
    transform 0.22s var(--ease-out),
    width 0.22s var(--ease-out);
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

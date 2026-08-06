<template>
  <div
    ref="root"
    class="aps"
    :class="[`aps--${size}`, { 'aps--open': open, 'aps--disabled': disabled }]"
    @keydown="onKeydown"
  >
    <!-- تریگر -->
    <button
      type="button"
      class="aps__trigger"
      :disabled="disabled"
      :aria-haspopup="'listbox'"
      :aria-expanded="open"
      @click="toggle"
    >
      <span class="aps__value" :class="{ 'aps__value--placeholder': isEmpty }">
        {{ displayLabel }}
      </span>
      <span class="aps__chev" :class="{ 'is-open': open }">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </span>
    </button>

    <!-- پنل دراپ‌داون -->
    <transition name="aps-pop" @after-leave="afterLeave">
      <div v-if="open" class="aps__panel">
        <ul class="aps__list" role="listbox" :aria-activedescendant="activeId">
          <li
            v-for="(opt, i) in options"
            :key="opt.value"
            :id="`${uid}-${i}`"
            role="option"
            class="aps__item"
            :class="{
              'aps__item--active': modelValue === opt.value,
              'aps__item--focused': i === focusIndex,
            }"
            :style="{ '--i': i }"
            @click="select(opt)"
            @mouseenter="focusIndex = i"
          >
            <span class="aps__dot" aria-hidden="true"></span>
            <span class="aps__label">{{ opt.label }}</span>
            <span class="aps__check" aria-hidden="true">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
          </li>
        </ul>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options:    { type: Array,  required: true },  // [{ value, label }]
  placeholder:{ type: String, default: '— انتخاب کنید —' },
  size:       { type: String, default: 'md' },   // 'md' | 'sm'
  disabled:   { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change'])

const open       = ref(false)
const focusIndex = ref(-1)
const uid        = Math.random().toString(36).slice(2, 8)

const currentLabel = computed(() => {
  const hit = props.options.find(o => String(o.value) === String(props.modelValue))
  return hit ? hit.label : null
})
const isEmpty = computed(() => currentLabel.value === null)
const displayLabel = computed(() => currentLabel.value ?? props.placeholder)

const activeId = computed(() =>
  focusIndex.value >= 0 ? `${uid}-${focusIndex.value}` : null
)

function toggle() { open.value = !open.value; if (open.value) focusIndex.value = maxFocus() }

function maxFocus() {
  const hit = props.options.findIndex(o => String(o.value) === String(props.modelValue))
  return hit >= 0 ? hit : 0
}

function select(opt) {
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  open.value = false
}

function onKeydown(e) {
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); open.value = true; focusIndex.value = maxFocus() }
    return
  }
  const n = props.options.length
  switch (e.key) {
    case 'Escape':      open.value = false; break
    case 'ArrowDown':   e.preventDefault(); focusIndex.value = (focusIndex.value + 1) % n; break
    case 'ArrowUp':     e.preventDefault(); focusIndex.value = (focusIndex.value - 1 + n) % n; break
    case 'Enter':
    case ' ':           e.preventDefault(); if (focusIndex.value >= 0) select(props.options[focusIndex.value]); break
    case 'Tab':         open.value = false; break
  }
}

function onClickOutside(e) {
  if (open.value && el.value && !el.value.contains(e.target)) open.value = false
}
function onResize() {
  if (open.value) open.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  document.addEventListener('mouseup', onClickOutside)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside)
  document.removeEventListener('mouseup', onClickOutside)
  window.removeEventListener('resize', onResize)
})

function afterLeave() { focusIndex.value = -1 }
</script>

<style scoped>
.aps {
  position: relative;
  min-width: 0;
  font-size: 12.5px;
}
.aps--disabled { cursor: not-allowed; }

/* ─────────── تریگر ─────────── */
.aps__trigger {
  --trigger-bg: var(--bg-input);
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: linear-gradient(180deg, var(--bg-panel), color-mix(in srgb, var(--bg-panel) 90%, var(--accent-depth) 3%));
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 0 12px;
  min-height: 38px;
  color: var(--text-primary);
  font-family: inherit;
  cursor: pointer;
  text-align: start;
  box-shadow: var(--shadow-xs);
  transition:
    border-color var(--dur-base) var(--ease-out),
    box-shadow var(--dur-base) var(--ease-out),
    background var(--dur-base) var(--ease-out),
    transform var(--dur-base) var(--ease-spring);
}
.aps__trigger:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--accent-depth) 70%, var(--border-strong));
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.aps__trigger:active:not(:disabled) { transform: translateY(0) scale(0.985); }
.aps--open .aps__trigger {
  border-color: var(--accent-depth);
  box-shadow: 0 0 0 4px var(--ring-color), var(--shadow-sm);
  transform: translateY(-1px);
}
.aps__trigger:disabled { opacity: 0.5; cursor: not-allowed; }

.aps__value {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aps__value--placeholder {
  color: var(--text-muted);
  font-weight: 400;
}

/* شورون چرخان نرم */
.aps__chev {
  flex-shrink: 0;
  display: inline-flex;
  color: var(--text-muted);
  transition: transform 0.38s var(--ease-spring), color 0.2s var(--ease-out);
}
.aps__trigger:hover:not(:disabled) .aps__chev { color: var(--accent-depth); }
.aps--open .aps__chev {
  transform: rotate(180deg);
  color: var(--accent-depth);
}
.aps--sm    .aps__trigger { min-height: 32px; padding: 0 10px; font-size: 12px; }
.aps__chev  { pointer-events: none; }

/* ─────────── پنل ─────────── */
.aps__panel {
  position: absolute;
  top: calc(100% + 8px);
  left: 0;
  right: 0;
  z-index: 60;
  background: color-mix(in srgb, var(--bg-panel-raised) 96%, transparent);
  backdrop-filter: blur(14px) saturate(1.3);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-md);
  padding: 6px;
  box-shadow: var(--shadow-lg);
  transform-origin: top center;
  overflow: hidden;
}
.aps__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 260px;
  overflow-y: auto;
  overflow-x: hidden;
}

.aps__item {
  --i: 0;
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 18px 9px 10px;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: start;
  transition: background var(--dur-fast) var(--ease-out), color var(--dur-fast) var(--ease-out);
}
.aps__item:hover,
.aps__item--focused {
  background: color-mix(in srgb, var(--accent-depth) 9%, var(--bg-panel));
  color: var(--text-primary);
}

.aps__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  background: color-mix(in srgb, var(--accent-depth) 30%, transparent);
  transition: transform var(--dur-base) var(--ease-spring), background var(--dur-fast) var(--ease-out);
}
.aps__item:hover .aps__dot,
.aps__item--focused .aps__dot { transform: scale(1.4); background: var(--accent-depth); }
.aps__item--active .aps__dot { background: var(--accent-depth); transform: scale(1.4); }

.aps__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aps__item--active .aps__label {
  color: var(--accent-depth);
  font-weight: 700;
}

.aps__check {
  flex-shrink: 0;
  color: var(--accent-depth);
  opacity: 0;
  transform: scale(0.4) rotate(-20deg);
  transition: opacity var(--dur-base) var(--ease-out), transform var(--dur-base) var(--ease-spring);
}
.aps__item--active .aps__check {
  opacity: 1;
  transform: scale(1) rotate(0deg);
}

/* ─────────── ترنزیشن ورود/خروج ─────────── */
.aps-pop-enter-active,
.aps-pop-leave-active {
  transition:
    opacity 0.28s var(--ease-out),
    transform 0.34s var(--ease-out);
}
.aps-pop-enter-from,
.aps-pop-leave-to {
  opacity: 0;
  transform: translateY(-10px) scaleY(0.92) scale(0.97);
}
.aps-pop-enter-to,
.aps-pop-leave-from { opacity: 1; transform: translateY(0) scaleY(1) scale(1); }

/* استقرای نرم آیتم‌ها (پشت‌صحنه‌ی پانل) */
.aps__item {
  animation: aps-item-in 0.4s var(--ease-spring) both;
  animation-delay: calc(var(--i) * 34ms);
}
.aps__item--active { animation-delay: 0s; }
@keyframes aps-item-in {
  from { opacity: 0; transform: translateY(8px) scale(0.96); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}

@media (prefers-reduced-motion: reduce) {
  .aps__item { animation: none; }
  .aps-pop-enter-active, .aps-pop-leave-active { transition: opacity 0.12s linear; }
}

/* اسکرول‌بار داخلی */
.aps__list::-webkit-scrollbar { width: 8px; }
.aps__list::-webkit-scrollbar-thumb {
  background: color-mix(in srgb, var(--text-muted) 35%, transparent);
  border-radius: var(--radius-full);
}
</style>
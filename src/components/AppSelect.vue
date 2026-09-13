<template>
  <div
    ref="root"
    class="aps"
    :class="[`aps--${size}`, { 'aps--open': open, 'aps--disabled': disabled }]"
    @keydown="onKeydown"
  >
    <!-- تریگر -->
    <button
      ref="triggerBtn"
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

    <!-- پنل دراپ‌داون — teleport به body تا داخل پنل‌های اسکرول‌دار بریده نشود -->
    <Teleport to="body">
      <transition name="aps-pop" @after-leave="afterLeave">
        <div
          v-if="open"
          ref="panelEl"
          class="aps__panel aps__panel--fixed"
          :style="panelStyle"
          :data-theme-root="true"
        >
          <ul v-if="options.length" class="aps__list" role="listbox" :aria-activedescendant="activeId">
            <li
              v-for="(opt, i) in options"
              :key="String(opt.value) + '-' + i"
              :id="`${uid}-${i}`"
              role="option"
              :aria-selected="isActive(opt)"
              class="aps__item"
              :class="{
                'aps__item--active': isActive(opt),
                'aps__item--focused': i === focusIndex,
              }"
              :style="{ '--i': i }"
              @click="select(opt)"
              @mouseenter="focusIndex = i"
            >
              <span class="aps__dot" aria-hidden="true"></span>
              <span class="aps__label" :title="opt.label">{{ opt.label }}</span>
              <span class="aps__check" aria-hidden="true">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </span>
            </li>
          </ul>
          <div v-else class="aps__empty">موردی برای انتخاب نیست</div>
        </div>
      </transition>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Number], default: '' },
  options:    { type: Array,  required: true },  // [{ value, label }]
  placeholder:{ type: String, default: '— انتخاب کنید —' },
  size:       { type: String, default: 'md' },   // 'md' | 'sm'
  disabled:   { type: Boolean, default: false },
})
const emit = defineEmits(['update:modelValue', 'change'])

const root       = ref(null)
const triggerBtn = ref(null)
const panelEl    = ref(null)
const panelStyle = ref({})
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

function isActive(opt) {
  return String(opt.value) === String(props.modelValue)
}

function toggle() {
  if (props.disabled) return
  if (open.value) closePanel()
  else openPanel()
}

function openPanel() {
  open.value = true
  focusIndex.value = maxFocus()
  nextTick(() => updatePanelPos())
}

function closePanel() {
  open.value = false
}

function updatePanelPos() {
  const t = triggerBtn.value
  if (!t) return
  const r = t.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  // پنل حداقل هم‌عرض تریگر، حداقل ۲۲۰px تا متن فارسی خوانا بماند
  let w = Math.max(r.width, 220)
  w = Math.min(w, Math.min(360, vw - 16))
  let left = r.left
  // در RTL تریگر تمام‌عرض است؛ لبه راست را با تریگر هم‌تراز نگه دار
  left = r.right - w
  if (left < 8) left = 8
  if (left + w > vw - 8) left = Math.max(8, vw - w - 8)
  // اگر پایین جا نیست، رو به بالا باز کن
  const estH = Math.min(268, 40 + props.options.length * 38)
  let top
  if (r.bottom + 8 + estH > vh - 8 && r.top - 8 - estH > 8) {
    top = Math.max(8, r.top - 8 - estH)
  } else {
    top = r.bottom + 8
  }
  panelStyle.value = {
    top: `${Math.round(top)}px`,
    left: `${Math.round(left)}px`,
    width: `${Math.round(w)}px`,
  }
}

function maxFocus() {
  const hit = props.options.findIndex(o => String(o.value) === String(props.modelValue))
  return hit >= 0 ? hit : 0
}

function select(opt) {
  emit('update:modelValue', opt.value)
  emit('change', opt.value)
  closePanel()
  triggerBtn.value?.focus?.()
}

function onKeydown(e) {
  if (props.disabled) return
  if (!open.value) {
    if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); openPanel() }
    return
  }
  const n = props.options.length
  if (!n && e.key === 'Escape') { closePanel(); return }
  switch (e.key) {
    case 'Escape':      closePanel(); triggerBtn.value?.focus?.(); break
    case 'ArrowDown':   e.preventDefault(); focusIndex.value = n ? (focusIndex.value + 1) % n : -1; break
    case 'ArrowUp':     e.preventDefault(); focusIndex.value = n ? (focusIndex.value - 1 + n) % n : -1; break
    case 'Enter':
    case ' ':           e.preventDefault(); if (focusIndex.value >= 0 && props.options[focusIndex.value]) select(props.options[focusIndex.value]); break
    case 'Tab':         closePanel(); break
  }
}

function onPointerDown(e) {
  if (!open.value) return
  const inRoot = root.value?.contains(e.target)
  const inPanel = panelEl.value?.contains(e.target)
  if (!inRoot && !inPanel) closePanel()
}
function onScrollCapture() {
  if (open.value) updatePanelPos()
}
function onResize() {
  if (open.value) updatePanelPos()
}

onMounted(() => {
  document.addEventListener('mousedown', onPointerDown)
  document.addEventListener('touchstart', onPointerDown, { passive: true })
  document.addEventListener('scroll', onScrollCapture, true)
  window.addEventListener('resize', onResize)
})
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onPointerDown)
  document.removeEventListener('touchstart', onPointerDown)
  document.removeEventListener('scroll', onScrollCapture, true)
  window.removeEventListener('resize', onResize)
})

function afterLeave() { focusIndex.value = -1 }
</script>

<style scoped>
.aps {
  position: relative;
  min-width: 0;
  width: 100%;
  font-size: 12.5px;
}
.aps--disabled { cursor: not-allowed; }

/* ─────────── تریگر ─────────── */
.aps__trigger {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-sm);
  padding: 0 10px;
  min-height: 36px;
  color: var(--text-primary);
  font-family: inherit;
  font-size: inherit;
  cursor: pointer;
  text-align: start;
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.aps__trigger:hover:not(:disabled) {
  border-color: var(--text-muted);
}
.aps--open .aps__trigger {
  border-color: var(--brand);
  box-shadow: 0 0 0 2px var(--ring-color);
}
.aps__trigger:disabled { opacity: 0.5; cursor: not-allowed; }

.aps__value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  line-height: 1.8;
}
.aps__value--placeholder {
  color: var(--text-muted);
  font-weight: 400;
}

/* شورون */
.aps__chev {
  flex-shrink: 0;
  display: inline-flex;
  color: var(--text-muted);
  transition: transform var(--dur-fast) var(--ease-out);
  pointer-events: none;
}
.aps--open .aps__chev {
  transform: rotate(180deg);
  color: var(--text-secondary);
}
.aps--sm    .aps__trigger { min-height: 32px; padding: 0 10px; font-size: 12px; }

/* ─────────── پنل (fixed در body) ─────────── */
.aps__panel {
  background: var(--bg-panel);
  border: 1px solid var(--border-strong);
  border-radius: var(--radius-md);
  padding: 6px;
  box-shadow: var(--shadow-lg);
  transform-origin: top center;
  overflow: hidden;
}
.aps__panel--fixed {
  position: fixed;
  z-index: 11000;
  max-height: 268px;
  display: flex;
  flex-direction: column;
}
.aps__list {
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 256px;
  overflow-y: auto;
  overflow-x: hidden;
}

.aps__item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 8px 10px;
  border-radius: var(--radius-xs);
  color: var(--text-secondary);
  cursor: pointer;
  text-align: start;
  font-size: 12.5px;
  line-height: 1.7;
  transition: background var(--dur-fast) var(--ease-out);
}
.aps__item:hover,
.aps__item--focused {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.aps__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  background: var(--border-strong);
}
.aps__item--active .aps__dot { background: var(--brand); }

.aps__label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.aps__item--active .aps__label {
  color: var(--text-primary);
  font-weight: 700;
}

.aps__check {
  flex-shrink: 0;
  color: var(--brand);
  opacity: 0;
}
.aps__item--active .aps__check {
  opacity: 1;
}

.aps__empty {
  padding: 12px;
  text-align: center;
  font-size: 12px;
  color: var(--text-muted);
}

/* ─────────── ترنزیشن ورود/خروج ─────────── */
.aps-pop-enter-active,
.aps-pop-leave-active {
  transition: opacity var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out);
}
.aps-pop-enter-from,
.aps-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.aps-pop-enter-to,
.aps-pop-leave-from { opacity: 1; transform: translateY(0); }

@media (prefers-reduced-motion: reduce) {
  .aps__item { animation: none; }
  .aps-pop-enter-active, .aps-pop-leave-active { transition: opacity 0.12s linear; }
}

/* اسکرول‌بار داخلی */
.aps__list::-webkit-scrollbar { width: 8px; }
.aps__list::-webkit-scrollbar-thumb {
  background: var(--border-strong);
  border-radius: 4px;
}
</style>

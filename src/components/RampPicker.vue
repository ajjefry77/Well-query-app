<template>
  <div class="ramp-wrap" ref="wrapRef">
    <button ref="btnRef" class="ramp-btn" @click.stop="toggle" :title="current?.name">
      <span class="ramp-bar" :style="{ background: barBg(current) }"></span>
      <span class="ramp-name">{{ current?.name }}</span>
      <span class="ramp-chev">▾</span>
    </button>
    <Teleport to="body">
      <div v-if="open" class="ramp-drop" :style="dropStyle" @click.stop>
        <div class="ramp-group" v-for="g in visibleGroups" :key="g">
          <div class="ramp-group-t">{{ g === 'sequential' ? 'ترتیبی' : g === 'diverging' ? 'واگرا' : 'مقوله‌ای' }}</div>
          <button v-for="r in byGroup(g)" :key="r.id"
            class="ramp-opt" :class="{ active: r.id === modelValue }" @click.stop="pick(r.id)">
            <span class="ramp-bar" :style="{ background: barBg(r) }"></span>
            <span class="ramp-opt-name">{{ r.name }}</span>
          </button>
        </div>
        <div v-if="!hasAny" class="ramp-empty">رامپی موجود نیست</div>
      </div>
    </Teleport>
  </div>
</template>
<script setup>
import { ref, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { COLOR_RAMPS } from '../composables/useSymbology.js'
const props = defineProps({ modelValue: { type: String, default: 'spectral' }, categorical: { type: Boolean, default: true } })
const emit = defineEmits(['update:modelValue', 'change'])
const open = ref(false)
const btnRef = ref(null)
const wrapRef = ref(null)
const dropStyle = ref({})

// وقتی categorical=true (مقادیر یکتا) فقط رامپ مقوله‌ای؛ وگرنه ترتیبی/واگرا
const visibleGroups = computed(() => props.categorical ? ['categorical'] : ['sequential', 'diverging'])
function byGroup(g) {
  return COLOR_RAMPS.filter(x => x.kind === g)
}
const hasAny = computed(() => visibleGroups.value.some(g => byGroup(g).length > 0))
const current = computed(() => COLOR_RAMPS.find(r => r.id === props.modelValue) ?? COLOR_RAMPS[0])
function barBg(r) {
  if (!r) return '#ccc'
  return `linear-gradient(to left, ${r.stops.join(',')})`
}
function placeDrop() {
  try {
    const el = btnRef.value
    if (!el) return
    const rc = el.getBoundingClientRect()
    const w = Math.max(rc.width, 230)
    let left = rc.right - w // هم‌تراز با لبه راست دکمه (راست‌چین)
    left = Math.max(8, Math.min(left, window.innerWidth - w - 8))
    let top = rc.bottom + 6
    top = Math.max(8, Math.min(top, window.innerHeight - 280))
    dropStyle.value = { top: top + 'px', left: left + 'px', width: w + 'px' }
  } catch {}
}
function toggle() {
  if (open.value) { open.value = false; return }
  open.value = true
  nextTick(placeDrop)
}
function pick(id) { open.value = false; emit('update:modelValue', id); emit('change', id) }
function close() { open.value = false }
function onDocClick(e) {
  if (!open.value) return
  // کلیک داخل دکمه یا داخل دراپ‌داون → نبند
  if (e.target?.closest?.('.ramp-drop')) return
  if (e.target?.closest?.('.ramp-wrap')) return
  close()
}
function onScrollCapture(e) {
  if (!open.value) return
  // اسکرول داخل خود لیست رامپ‌ها نباید آن را ببندد
  if (e?.target?.closest?.('.ramp-drop')) return
  close()
}
function onKey(e) { if (e.key === 'Escape') close() }
function onResize() { if (open.value) close() }
onMounted(() => {
  document.addEventListener('click', onDocClick)
  window.addEventListener('scroll', onScrollCapture, true)
  window.addEventListener('resize', onResize)
  document.addEventListener('keydown', onKey)
})
onBeforeUnmount(() => {
  document.removeEventListener('click', onDocClick)
  window.removeEventListener('scroll', onScrollCapture, true)
  window.removeEventListener('resize', onResize)
  document.removeEventListener('keydown', onKey)
})
</script>
<style scoped>
.ramp-wrap { position: relative; flex: 1; min-width: 180px; }
.ramp-btn { display: flex; align-items: center; gap: 8px; width: 100%; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 8px; padding: 6px 10px; cursor: pointer; font-family: inherit; }
.ramp-bar { flex: 1; height: 14px; border-radius: 5px; border: 1px solid rgba(0,0,0,0.2); min-width: 0; }
.ramp-name { font-size: 11px; color: var(--text-secondary); white-space: nowrap; }
.ramp-chev { color: var(--text-muted); font-size: 11px; }
</style>
<style>
/* نکته: چون دراپ‌داون با Teleport به body منتقل می‌شود تا زیر overflow بریده نشود، استایلش باید global باشد */
.ramp-drop { position: fixed; z-index: 3000; background: var(--bg-panel); border: 1px solid var(--border-strong); border-radius: 10px; box-shadow: var(--shadow-md); padding: 8px; max-height: 320px; overflow-y: auto; overscroll-behavior: contain; direction: rtl; -webkit-overflow-scrolling: touch; }
.ramp-group-t { font-size: 10.5px; color: var(--text-muted); font-weight: 700; margin: 6px 2px 4px; }
.ramp-group-t:first-child { margin-top: 0; }
.ramp-opt { display: flex; align-items: center; gap: 8px; width: 100%; background: transparent; border: 1px solid transparent; border-radius: 7px; padding: 4px; cursor: pointer; font-family: inherit; }
.ramp-opt:hover, .ramp-opt.active { border-color: var(--brand); background: var(--brand-soft); }
.ramp-opt .ramp-bar { height: 16px; flex: 1; border-radius: 5px; border: 1px solid rgba(0,0,0,0.2); }
.ramp-opt-name { font-size: 10.5px; color: var(--text-secondary); white-space: nowrap; }
.ramp-empty { font-size: 12px; color: var(--text-muted); text-align: center; padding: 10px; font-style: italic; }
</style>

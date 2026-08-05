<template>
  <div class="mobile-sheet-chrome" :class="{ 'is-closed': !open }">
    <div class="mobile-sheet__grab" @pointerdown="$emit('grab-start', $event)"></div>
    <div class="mobile-sheet__tabs" v-show="open">
      <button
        class="mobile-sheet__tab"
        :class="{ 'mobile-sheet__tab--active': mobileTab === 'query' }"
        @click="$emit('update:mobile-tab', 'query')"
      >کوئری</button>
      <button
        class="mobile-sheet__tab"
        :class="{ 'mobile-sheet__tab--active': mobileTab === 'layers' }"
        @click="$emit('update:mobile-tab', 'layers')"
      >لایه‌های فعال</button>
      <button class="mobile-sheet__close" @click="$emit('close')" title="بستن پنل پایین">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  mobileTab: { type: String, required: true },
  open: { type: Boolean, default: true },
})
defineEmits(['update:mobile-tab', 'grab-start', 'close'])
</script>

<style scoped>
@media (max-width: 760px) {
  .mobile-sheet-chrome {
    position: absolute;
    inset-inline: 0;
    bottom: max(calc(var(--sheet-h, 42vh) - 64px), 0px);
    height: 64px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border-radius: 16px 16px 0 0;
    border-top: 1px solid var(--border-subtle);
    box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.15);
    transition: bottom 0.3s var(--ease-out), height 0.3s var(--ease-out);
  }
  /* حالت کاملاً بسته: فقط هندل می‌ماند */
  .mobile-sheet-chrome.is-closed {
    height: 36px;
  }
  .mobile-sheet-chrome.is-closed .mobile-sheet__grab {
    flex: 1;
  }
  .mobile-sheet__grab {
    height: 20px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: ns-resize;
    touch-action: none;
  }
  .mobile-sheet__grab::before {
    content: '';
    width: 44px;
    height: 5px;
    border-radius: var(--radius-full);
    background: var(--border-strong);
  }
  .mobile-sheet__tabs {
    flex: 1;
    display: flex;
    gap: 6px;
    align-items: flex-end;
    padding: 0 12px 12px;
  }
  .mobile-sheet__tab {
    flex: 1;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    font-size: 12.5px;
    font-weight: 600;
    padding: 0 6px;
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s;
  }
  .mobile-sheet__tab--active {
    background: var(--accent-depth);
    border-color: var(--accent-depth);
    color: #fff;
    font-weight: 700;
  }
  .mobile-sheet__close {
    flex-shrink: 0;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--bg-input);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
    border-radius: var(--radius-full);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.1s;
  }
  .mobile-sheet__close:hover {
    color: var(--accent-depth);
    border-color: var(--accent-depth);
    background: color-mix(in srgb, var(--accent-depth) 8%, var(--bg-input));
  }
  .mobile-sheet__close:active {
    transform: scale(0.92);
  }
}
</style>

<template>
  <div class="mobile-sheet-chrome">
    <div class="mobile-sheet__grab" @pointerdown="$emit('grab-start', $event)"></div>
    <div class="mobile-sheet__tabs">
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
    </div>
  </div>
</template>

<script setup>
defineProps({
  mobileTab: { type: String, required: true },
})
defineEmits(['update:mobile-tab', 'grab-start'])
</script>

<style scoped>
@media (max-width: 760px) {
  .mobile-sheet-chrome {
    position: absolute;
    inset-inline: 0;
    bottom: calc(var(--sheet-h, 42vh) - 64px);
    height: 64px;
    z-index: 40;
    display: flex;
    flex-direction: column;
    background: var(--bg-panel);
    border-radius: 16px 16px 0 0;
    border-top: 1px solid var(--border-subtle);
    box-shadow: 0 -6px 20px rgba(0, 0, 0, 0.15);
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
}
</style>

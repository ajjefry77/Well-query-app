<template>
  <div class="nf">
    <div class="nf__card" role="alert" aria-label="صفحه یافت نشد">
      <div class="nf__badge">خطای ۴۰۴</div>
      <div class="nf__code" aria-hidden="true"><span>4</span><span class="nf__globe">🗺</span><span>4</span></div>
      <h1 class="nf__title">این مسیر روی نقشه نیست!</h1>
      <p class="nf__desc">
        صفحه‌ای که دنبالش می‌گردی وجود ندارد یا جابه‌جا شده.
        <span v-if="badPath" class="nf__path mono" dir="ltr">/{{ badPath }}</span>
      </p>
      <div class="nf__actions">
        <RouterLink to="/" class="nf__btn nf__btn--primary">بازگشت به خانه</RouterLink>
        <button class="nf__btn" @click="goBack">صفحه قبلی</button>
      </div>
      <div class="nf__links">
        <RouterLink to="/?view=attribute">کوئری توصیفی</RouterLink>
        <span class="nf__sep">•</span>
        <RouterLink to="/?view=spatial">کوئری مکانی</RouterLink>
        <span class="nf__sep">•</span>
        <RouterLink to="/?view=stratigraphy">چینه‌شناسی</RouterLink>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute, useRouter } from '../router/index.js'

const route = useRoute()
const router = useRouter()

const badPath = computed(() => {
  const pm = route.params?.pathMatch
  if (Array.isArray(pm)) return pm.join('/')
  return pm ?? ''
})

function goBack() {
  if (window.history.length > 1) router.back()
  else router.replace('/')
}
</script>

<style scoped>
.nf {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px 16px;
  background:
    radial-gradient(600px 300px at 50% -80px, color-mix(in srgb, var(--brand) 14%, transparent), transparent),
    var(--bg-deep);
}
.nf__card {
  width: 100%;
  max-width: 520px;
  background: var(--bg-panel);
  border: 1px solid var(--border-subtle);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-lg);
  padding: 36px 32px 28px;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  animation: nf-in 0.35s var(--ease-out);
}
@keyframes nf-in {
  from { opacity: 0; transform: translateY(12px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.nf__badge {
  font-size: 11px;
  font-weight: 700;
  color: var(--brand);
  background: var(--brand-soft);
  border: 1px solid color-mix(in srgb, var(--brand) 30%, transparent);
  padding: 4px 14px;
  border-radius: var(--radius-full);
}
.nf__code {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 76px;
  font-weight: 800;
  line-height: 1;
  color: var(--text-primary);
  font-family: var(--font-mono);
  direction: ltr;
  user-select: none;
}
.nf__globe {
  font-size: 54px;
  animation: nf-float 3s ease-in-out infinite;
}
@keyframes nf-float {
  0%, 100% { transform: translateY(0) rotate(-4deg); }
  50% { transform: translateY(-8px) rotate(4deg); }
}
.nf__title { margin: 4px 0 0; font-size: 20px; font-weight: 800; }
.nf__desc { margin: 0; font-size: 13.5px; color: var(--text-secondary); line-height: 2; }
.nf__path {
  display: inline-block;
  font-size: 11.5px;
  background: var(--bg-panel-raised);
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
  padding: 1px 8px;
  margin-inline-start: 6px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  vertical-align: middle;
}
.nf__actions { display: flex; gap: 10px; margin-top: 10px; flex-wrap: wrap; justify-content: center; }
.nf__btn {
  font-family: inherit;
  font-size: 13px;
  font-weight: 700;
  padding: 10px 22px;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-strong);
  background: var(--bg-input);
  color: var(--text-primary);
  cursor: pointer;
  text-decoration: none;
}
.nf__btn:hover { border-color: var(--brand); color: var(--brand); }
.nf__btn--primary {
  background: var(--brand);
  border-color: var(--brand-strong);
  color: #fff;
}
.nf__btn--primary:hover { background: var(--brand-strong); color: #fff; }
.nf__links { display: flex; align-items: center; gap: 10px; margin-top: 8px; font-size: 12px; }
.nf__links a { color: var(--text-muted); text-decoration: none; }
.nf__links a:hover { color: var(--brand); text-decoration: underline; }
.nf__sep { color: var(--border-strong); }
@media (max-width: 520px) {
  .nf__card { padding: 28px 20px 22px; }
  .nf__code { font-size: 60px; }
  .nf__globe { font-size: 42px; }
}
</style>

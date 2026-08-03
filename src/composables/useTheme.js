import { ref } from 'vue'

const STORAGE_KEY = 'well-query-theme'

function detectInitial() {
  if (typeof window === 'undefined') return 'light'
  const saved = localStorage.getItem(STORAGE_KEY)
  if (saved === 'light' || saved === 'dark') return saved
  if (window.matchMedia?.('(prefers-color-scheme: dark)').matches) return 'dark'
  return 'light'
}

function applyTheme(t, animate = false) {
  const root = document.documentElement
  if (animate) {
    root.classList.add('theme-transition')
    setTimeout(() => root.classList.remove('theme-transition'), 450)
  }
  root.dataset.theme = t
}

const theme = ref(detectInitial())

export function useTheme() {
  function setTheme(t) {
    if (t !== 'light' && t !== 'dark') return
    theme.value = t
    localStorage.setItem(STORAGE_KEY, t)
    applyTheme(t, true)
  }
  function toggle() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }
  return { theme, setTheme, toggle }
}

// اجرای اولیه قبل از mount برای جلوگیری از پرش (FOUC)
applyTheme(theme.value)

import { createApp } from 'vue'
import App from './App.vue'
import './styles/tokens.css'
import router from './router/index.js'
import { useTheme } from './composables/useTheme.js'

const { applyInitialTheme } = useTheme()
applyInitialTheme()

const app = createApp(App)
app.use(router)
app.config.errorHandler = (err, instance, info) => {
  console.error('[app error]', err, info)
}
window.addEventListener('unhandledrejection', (e) => {
  console.error('[unhandled rejection]', e.reason)
})
app.mount('#app')

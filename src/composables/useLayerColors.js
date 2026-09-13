// رنگ یکتا و پایدار برای هر لایه — پالت سازمانی muted (خوانا در هر دو تم)
export const LAYER_COLORS = ['#0f5c7e', '#5b7d99', '#7c6a45', '#4a6b5d', '#8a4a3c', '#3f6d8e', '#6b7f59', '#55606e']

export function hashString(s) {
  let h = 0
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0
  return Math.abs(h)
}

export function layerColor(uuid, index = 0) {
  if (uuid) return LAYER_COLORS[hashString(uuid) % LAYER_COLORS.length]
  return LAYER_COLORS[index % LAYER_COLORS.length]
}

export function formatFaNumber(n) {
  if (n === null || n === undefined) return '—'
  if (typeof n === 'number') return n.toLocaleString('fa-IR')
  const num = Number(n)
  if (Number.isFinite(num) && String(n).trim() !== '') return num.toLocaleString('fa-IR')
  return String(n)
}

// رنگ یکتا و پایدار برای هر لایه — تنها منبع حقیقت
export const LAYER_COLORS = ['#2a9d8f', '#e9c46a', '#f4a261', '#e76f51', '#264653', '#a8dadc', '#457b9d', '#e63946']

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

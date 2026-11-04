import { generateContours } from '../utils/contours.js'

self.onmessage = async ({ data }) => {
  try {
    const result = await generateContours(data.rows, data.options, progress => self.postMessage({ progress }))
    self.postMessage({ result }, [result.values.buffer, result.mask.buffer])
  } catch (error) {
    self.postMessage({ error: error.message || 'ساخت نقشه انجام نشد.' })
  }
}

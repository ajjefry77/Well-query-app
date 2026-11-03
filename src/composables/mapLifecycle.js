// Own animation frames for one map instance so delayed work cannot outlive it.
export function createMapLifecycle() {
  let active = true
  const frames = new Set()
  return {
    get active() { return active },
    frame(callback) {
      if (!active) return null
      const id = requestAnimationFrame(time => {
        frames.delete(id)
        if (active) callback(time)
      })
      frames.add(id)
      return id
    },
    dispose() {
      active = false
      for (const id of frames) cancelAnimationFrame(id)
      frames.clear()
    },
  }
}

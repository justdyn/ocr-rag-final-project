/** Coalesce XHR upload ticks so progress re-renders stay off the text-input path. */
export const PROGRESS_THROTTLE_MS = 180

export function createProgressThrottle(
  emit: (fraction: number) => void,
  intervalMs: number = PROGRESS_THROTTLE_MS,
): (fraction: number) => void {
  let lastEmit = 0
  let pending: number | null = null
  let timer: ReturnType<typeof setTimeout> | null = null

  function flush(value: number) {
    lastEmit = Date.now()
    pending = null
    emit(value)
  }

  return (fraction: number) => {
    let value = Math.min(1, Math.max(0, fraction))
    if (value >= 1) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      flush(1)
      return
    }
    let now = Date.now()
    let wait = intervalMs - (now - lastEmit)
    if (wait <= 0) {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      flush(value)
      return
    }
    pending = value
    if (timer) return
    timer = setTimeout(() => {
      timer = null
      if (pending != null) flush(pending)
    }, wait)
  }
}

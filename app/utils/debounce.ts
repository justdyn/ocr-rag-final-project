/**
 * Tiny debounce helper for search inputs (no framework deps).
 */
export function debounce<TArgs extends unknown[]>(
  fn: (...args: TArgs) => void,
  waitMs: number,
): ((...args: TArgs) => void) & { cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | null = null

  let wrapped = ((...args: TArgs) => {
    if (timer != null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      fn(...args)
    }, waitMs)
  }) as ((...args: TArgs) => void) & { cancel: () => void }

  wrapped.cancel = () => {
    if (timer != null) {
      clearTimeout(timer)
      timer = null
    }
  }

  return wrapped
}

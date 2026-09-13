/**
 * Chat viewport scroll helpers (prd-chat-viewport CV-1…CV-3).
 * Pure math + rAF coalesce — no DOM imports from actions/ui.
 */

export const CHAT_BOTTOM_THRESHOLD_PX = 80

/**
 * After a programmatic scroll our tween fires scroll events on the region —
 * and lands short of the bottom whenever content grew mid-tween. The scroll
 * handler must ignore those events or follow dies mid-stream (CV-2). Refreshed
 * on every programmatic scroll so retargets stay covered.
 */
export const PROGRAMMATIC_SCROLL_GRACE_MS = 300

export function distanceFromBottom(el: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}): number {
  return el.scrollHeight - el.scrollTop - el.clientHeight
}

export function isNearBottom(
  el: {
    scrollHeight: number
    scrollTop: number
    clientHeight: number
  },
  thresholdPx = CHAT_BOTTOM_THRESHOLD_PX,
): boolean {
  return distanceFromBottom(el) <= thresholdPx
}

/**
 * Should a scroll event update follow state? Programmatic tweens only ever
 * move scrollTop downward, so any upward movement is a user scroll — evaluate
 * it even inside the grace window (CV-3 scroll-up pauses follow mid-stream).
 */
export function shouldEvaluateScroll(opts: {
  top: number
  lastTop: number | null
  isProgrammaticScroll: boolean
}): boolean {
  if (opts.lastTop !== null && opts.top < opts.lastTop) return true
  return !opts.isProgrammaticScroll
}

/** One scroll action per animation frame while content grows (SSE tokens). */
export function createFollowScrollScheduler(opts: {
  getEl: () => HTMLElement | null
  shouldFollow: () => boolean
  scrollToBottom: (el: HTMLElement) => void
}): {
  schedule: () => void
  followNow: () => void
  cancel: () => void
  /** True while scroll events on the region are ours, not the user's. */
  isProgrammaticScroll: () => boolean
} {
  let rafId = 0
  let programmaticUntil = 0

  function run(el: HTMLElement) {
    programmaticUntil = Date.now() + PROGRAMMATIC_SCROLL_GRACE_MS
    opts.scrollToBottom(el)
  }

  function cancel() {
    if (rafId === 0) return
    if (typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafId)
    }
    rafId = 0
  }

  function schedule() {
    if (rafId !== 0) return
    if (typeof requestAnimationFrame !== 'function') {
      let el = opts.getEl()
      if (el && opts.shouldFollow()) run(el)
      return
    }
    rafId = requestAnimationFrame(() => {
      rafId = 0
      let el = opts.getEl()
      if (el && opts.shouldFollow()) run(el)
    })
  }

  /** Immediate programmatic jump (↓ fab) — ignores shouldFollow. */
  function followNow() {
    cancel()
    let el = opts.getEl()
    if (el) run(el)
  }

  function isProgrammaticScroll() {
    return Date.now() < programmaticUntil
  }

  return { schedule, followNow, cancel, isProgrammaticScroll }
}

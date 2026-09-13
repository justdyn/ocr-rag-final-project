import assert from 'node:assert/strict'
import { describe, it, mock } from 'node:test'

import {
  CHAT_BOTTOM_THRESHOLD_PX,
  createFollowScrollScheduler,
  distanceFromBottom,
  isNearBottom,
  PROGRAMMATIC_SCROLL_GRACE_MS,
  shouldEvaluateScroll,
} from './chat-scroll.ts'

function fakeScroller(partial: {
  scrollHeight: number
  scrollTop: number
  clientHeight: number
}) {
  return partial
}

describe('chat-scroll', () => {
  it('distanceFromBottom is scrollHeight - scrollTop - clientHeight', () => {
    assert.equal(
      distanceFromBottom(fakeScroller({ scrollHeight: 5000, scrollTop: 4200, clientHeight: 800 })),
      0,
    )
    assert.equal(
      distanceFromBottom(fakeScroller({ scrollHeight: 5000, scrollTop: 4000, clientHeight: 800 })),
      200,
    )
  })

  it('isNearBottom uses the 80px threshold inclusive', () => {
    assert.equal(CHAT_BOTTOM_THRESHOLD_PX, 80)
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 120, clientHeight: 800 })),
      true,
    )
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 119, clientHeight: 800 })),
      false,
    )
    assert.equal(
      isNearBottom(fakeScroller({ scrollHeight: 1000, scrollTop: 200, clientHeight: 800 })),
      true,
    )
  })

  it('follow scheduler coalesces to one scroll per frame', async () => {
    let scrolls = 0
    let el = { tag: 'scroller' } as unknown as HTMLElement
    let follow = true
    let scheduled: FrameRequestCallback[] = []

    let prevRaf = globalThis.requestAnimationFrame
    let prevCancel = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      scheduled.push(cb)
      return scheduled.length
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      scheduled[id - 1] = () => {}
    }) as typeof cancelAnimationFrame

    try {
      let { schedule, cancel } = createFollowScrollScheduler({
        getEl: () => el,
        shouldFollow: () => follow,
        scrollToBottom: () => {
          scrolls += 1
        },
      })

      schedule()
      schedule()
      schedule()
      assert.equal(scheduled.length, 1)
      scheduled[0](0)
      assert.equal(scrolls, 1)

      follow = false
      schedule()
      scheduled[1](0)
      assert.equal(scrolls, 1)

      follow = true
      schedule()
      cancel()
      // cancelled frame should not scroll
      assert.equal(scrolls, 1)
    } finally {
      globalThis.requestAnimationFrame = prevRaf
      globalThis.cancelAnimationFrame = prevCancel
    }
  })

  it('shouldEvaluateScroll skips our downward tweens, always honors user scroll-up', () => {
    // Ours: downward movement inside the programmatic window — ignore (CV-2).
    assert.equal(
      shouldEvaluateScroll({ top: 500, lastTop: 400, isProgrammaticScroll: true }),
      false,
    )
    // User scroll-up mid-tween — always evaluated so follow can pause (CV-3).
    assert.equal(
      shouldEvaluateScroll({ top: 300, lastTop: 400, isProgrammaticScroll: true }),
      true,
    )
    // No tween running — every scroll is fair game.
    assert.equal(
      shouldEvaluateScroll({ top: 500, lastTop: 400, isProgrammaticScroll: false }),
      true,
    )
    // First event before any position is known.
    assert.equal(
      shouldEvaluateScroll({ top: 400, lastTop: null, isProgrammaticScroll: false }),
      true,
    )
  })

  it('scheduler marks programmatic scrolls; grace expires; followNow jumps regardless of follow', () => {
    let scrolls = 0
    let el = { tag: 'scroller' } as unknown as HTMLElement
    let follow = true
    let scheduled: FrameRequestCallback[] = []

    let prevRaf = globalThis.requestAnimationFrame
    let prevCancel = globalThis.cancelAnimationFrame
    globalThis.requestAnimationFrame = ((cb: FrameRequestCallback) => {
      scheduled.push(cb)
      return scheduled.length
    }) as typeof requestAnimationFrame
    globalThis.cancelAnimationFrame = ((id: number) => {
      scheduled[id - 1] = () => {}
    }) as typeof cancelAnimationFrame

    mock.timers.enable({ apis: ['Date'] })
    try {
      mock.timers.setTime(1_000_000)

      let s = createFollowScrollScheduler({
        getEl: () => el,
        shouldFollow: () => follow,
        scrollToBottom: () => {
          scrolls += 1
        },
      })

      assert.equal(s.isProgrammaticScroll(), false, 'no scroll yet')

      s.schedule()
      scheduled[0](0)
      assert.equal(scrolls, 1)
      assert.equal(s.isProgrammaticScroll(), true, 'programmatic scroll opens grace window')

      mock.timers.tick(PROGRAMMATIC_SCROLL_GRACE_MS + 1)
      assert.equal(s.isProgrammaticScroll(), false, 'grace window expires')

      follow = false
      s.followNow()
      assert.equal(scrolls, 2, 'followNow jumps regardless of shouldFollow')
      assert.equal(s.isProgrammaticScroll(), true, 'followNow is also programmatic')
    } finally {
      mock.timers.reset()
      globalThis.requestAnimationFrame = prevRaf
      globalThis.cancelAnimationFrame = prevCancel
    }
  })
})

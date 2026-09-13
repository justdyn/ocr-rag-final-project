/**
 * Unit tests for the thread motion helpers added for the ChatGPT-style layout:
 * `entranceUserBubble` (user-pill entrance preset) and `animateScrollBottom`
 * (nested-thread pin-to-bottom; reduced-motion = instant jump, §5.4).
 *
 * The smooth tween runs through `scrollTweenRef` — framer-motion/dom needs
 * browser rAF, so node tests swap in a fake tween and assert the real
 * contract: numeric from→target plus `onUpdate` driving `el.scrollTop`.
 * Regression guard: framer cannot animate DOM `scrollTop` as a style
 * property, so `animate(el, { scrollTop })` was a silent no-op.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  animateGeneratingDots,
  animateScrollBottom,
  animateScrollFab,
  entranceUserBubble,
  scrollBottomTarget,
  scrollTweenRef,
} from './motion.ts'

describe('entranceUserBubble', () => {
  it('constructs an entrance mixin outside the browser', () => {
    assert.ok(entranceUserBubble())
  })
})

describe('animateScrollBottom', () => {
  it('jumps instantly when prefers-reduced-motion is set', () => {
    ;(globalThis as unknown as Record<string, unknown>).window = {
      matchMedia: () => ({ matches: true }),
    }
    let el = { scrollTop: 0, scrollHeight: 500 } as HTMLElement
    animateScrollBottom(el)
    assert.equal(el.scrollTop, 500)
  })

  it('scrollBottomTarget is the scroll end, not scrollHeight', () => {
    assert.equal(scrollBottomTarget({ scrollHeight: 900, clientHeight: 400 }), 500)
  })

  it('tweens scrollTop to the bottom target and retargets on growth', () => {
    ;(globalThis as unknown as Record<string, unknown>).window = {
      matchMedia: () => ({ matches: false }),
    }
    let saved = scrollTweenRef.current
    let calls: { from: number; to: number; onUpdate: (value: number) => void }[] = []
    let stopped = 0
    scrollTweenRef.current = (from, to, _duration, onUpdate) => {
      calls.push({ from, to, onUpdate })
      return { stop: () => (stopped += 1) }
    }
    try {
      let fake = { scrollTop: 100, scrollHeight: 900, clientHeight: 400 }
      let el = fake as HTMLElement
      animateScrollBottom(el)
      assert.deepEqual({ from: calls[0].from, to: calls[0].to }, { from: 100, to: 500 })
      calls[0].onUpdate(260)
      assert.equal(el.scrollTop, 260, 'onUpdate must drive scrollTop')
      // Thread grew mid-stream: stop the old tween, retarget to the new bottom.
      fake.scrollHeight = 1200
      animateScrollBottom(el)
      assert.equal(stopped, 1, 'previous tween must be stopped on retarget')
      assert.deepEqual({ from: calls[1].from, to: calls[1].to }, { from: 260, to: 800 })
      calls[1].onUpdate(700)
      assert.equal(el.scrollTop, 700)
    } finally {
      scrollTweenRef.current = saved
    }
  })
})

describe('animateScrollFab', () => {
  it('delegates visibility to CSS data-visible — never inline styles', () => {
    ;(globalThis as unknown as Record<string, unknown>).window = {
      matchMedia: () => ({ matches: true }),
    }
    let style: Record<string, string> = {}
    let dataset: Record<string, string> = {}
    let el = { style, dataset } as unknown as HTMLElement
    animateScrollFab(el, true)
    assert.equal(el.dataset.visible, 'true')
    animateScrollFab(el, false)
    assert.equal(el.dataset.visible, 'false')
    assert.equal(
      'opacity' in style || 'pointerEvents' in style,
      false,
      'inline opacity/pointer-events override the CSS data-visible contract',
    )
  })
})

describe('animateGeneratingDots', () => {
  it('leaves dots static under reduced motion', () => {
    ;(globalThis as unknown as Record<string, unknown>).window = {
      matchMedia: () => ({ matches: true }),
    }
    let dot = { style: { opacity: '', transform: '' } } as unknown as HTMLElement
    animateGeneratingDots([dot], true)
    assert.equal(dot.style.opacity, '0.45')
  })
})

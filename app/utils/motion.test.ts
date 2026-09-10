/**
 * Unit tests for the thread motion helpers added for the ChatGPT-style layout:
 * `entranceUserBubble` (user-pill entrance preset) and `animateScrollBottom`
 * (nested-thread pin-to-bottom; reduced-motion = instant jump, §5.4).
 *
 * The framer tween path is browser-only (framer-motion/dom needs DOM globals),
 * so node asserts the reduced-motion contract and that presets construct.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { entranceUserBubble, animateScrollBottom } from './motion.ts'

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
})

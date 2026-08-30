import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { circularProgressStroke } from './circular-progress.ts'

describe('circularProgressStroke', () => {
  it('uses 2πr for circumference and offsets from full to empty', () => {
    let { circumference, dashoffset } = circularProgressStroke(0, 12)
    assert.equal(circumference, 2 * Math.PI * 12)
    assert.equal(dashoffset, circumference)

    let half = circularProgressStroke(0.5, 12)
    assert.equal(half.dashoffset, half.circumference * 0.5)

    let done = circularProgressStroke(1, 12)
    assert.equal(done.dashoffset, 0)
  })

  it('clamps out-of-range fractions', () => {
    assert.equal(circularProgressStroke(-1, 10).dashoffset, 2 * Math.PI * 10)
    assert.equal(circularProgressStroke(2, 10).dashoffset, 0)
  })
})

import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createProgressThrottle, PROGRESS_THROTTLE_MS } from './upload-progress.ts'

describe('createProgressThrottle', () => {
  it('stays in the 150–200ms band', () => {
    assert.ok(PROGRESS_THROTTLE_MS >= 150)
    assert.ok(PROGRESS_THROTTLE_MS <= 200)
  })

  it('emits immediately, coalesces bursts, then flushes the latest value', async () => {
    let seen: number[] = []
    let push = createProgressThrottle((value) => seen.push(value), 40)
    push(0.1)
    push(0.2)
    push(0.4)
    assert.deepEqual(seen, [0.1])
    await new Promise((resolve) => setTimeout(resolve, 50))
    assert.deepEqual(seen, [0.1, 0.4])
  })

  it('flushes 1 immediately so completion is not delayed', () => {
    let seen: number[] = []
    let push = createProgressThrottle((value) => seen.push(value), 10_000)
    push(0.2)
    push(1)
    assert.deepEqual(seen, [0.2, 1])
  })
})

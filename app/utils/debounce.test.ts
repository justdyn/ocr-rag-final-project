import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { debounce } from './debounce.ts'

describe('debounce', () => {
  it('invokes once after quiet period', async () => {
    let calls: number[] = []
    let d = debounce((n: number) => {
      calls.push(n)
    }, 40)
    d(1)
    d(2)
    d(3)
    assert.deepEqual(calls, [])
    await new Promise((r) => setTimeout(r, 60))
    assert.deepEqual(calls, [3])
  })

  it('cancel prevents the pending call', async () => {
    let calls = 0
    let d = debounce(() => {
      calls += 1
    }, 30)
    d()
    d.cancel()
    await new Promise((r) => setTimeout(r, 50))
    assert.equal(calls, 0)
  })
})

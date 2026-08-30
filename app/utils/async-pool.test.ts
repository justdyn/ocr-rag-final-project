import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { COMPOSER_UPLOAD_CONCURRENCY, mapPool } from './async-pool.ts'

describe('mapPool', () => {
  it('never runs more than the limit in flight', async () => {
    let current = 0
    let peak = 0
    await mapPool([1, 2, 3, 4, 5, 6], 2, async () => {
      current += 1
      peak = Math.max(peak, current)
      await new Promise((resolve) => setTimeout(resolve, 15))
      current -= 1
    })
    assert.equal(peak, 2)
  })

  it('preserves order and uses the composer upload cap of 3', async () => {
    assert.equal(COMPOSER_UPLOAD_CONCURRENCY, 3)
    let seen: number[] = []
    let out = await mapPool(['a', 'b', 'c'], 3, async (item, index) => {
      seen.push(index)
      return item.toUpperCase()
    })
    assert.deepEqual(out, ['A', 'B', 'C'])
    assert.deepEqual(seen, [0, 1, 2])
  })
})

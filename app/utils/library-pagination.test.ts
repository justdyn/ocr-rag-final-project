import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { pageRange, showingRange, totalPages } from './library-pagination.ts'

describe('library-pagination helpers', () => {
  it('showingRange covers first and last pages', () => {
    assert.deepEqual(showingRange(1, 10, 143), { start: 1, end: 10 })
    assert.deepEqual(showingRange(2, 10, 143), { start: 11, end: 20 })
    assert.deepEqual(showingRange(15, 10, 143), { start: 141, end: 143 })
    assert.deepEqual(showingRange(1, 10, 0), { start: 0, end: 0 })
  })

  it('totalPages rounds up and floors empty lists at 1', () => {
    assert.equal(totalPages(0, 10), 1)
    assert.equal(totalPages(10, 10), 1)
    assert.equal(totalPages(11, 10), 2)
    assert.equal(totalPages(143, 10), 15)
  })

  it('pageRange returns compact tokens with ellipsis', () => {
    assert.deepEqual(pageRange(1, 5), [1, 2, 3, 4, 5])
    assert.deepEqual(pageRange(1, 10), [1, 2, 3, 4, 'ellipsis', 10])
    assert.deepEqual(pageRange(5, 10), [1, 'ellipsis', 4, 5, 6, 'ellipsis', 10])
    assert.deepEqual(pageRange(10, 10), [1, 'ellipsis', 7, 8, 9, 10])
  })
})

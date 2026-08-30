/**
 * Initials for sidebar account avatar — first+last word of name, else email.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { userInitials } from './user-initials.ts'

describe('userInitials', () => {
  it('uses first letters of first and last name words', () => {
    assert.equal(userInitials({ name: 'Oh Hyundo', email: 'oh@example.com' }), 'OH')
  })

  it('uses a single letter when name is one word', () => {
    assert.equal(userInitials({ name: 'Ada', email: 'ada@example.com' }), 'A')
  })

  it('falls back to email first letter when name is empty', () => {
    assert.equal(userInitials({ name: '', email: 'zara@example.com' }), 'Z')
    assert.equal(userInitials({ name: '   ', email: 'zara@example.com' }), 'Z')
  })

  it('collapses middle words to first+last only', () => {
    assert.equal(
      userInitials({ name: 'Mary Jane Watson', email: 'mj@example.com' }),
      'MW',
    )
  })

  it('returns empty string when both name and email are blank', () => {
    assert.equal(userInitials({ name: '', email: '' }), '')
  })
})

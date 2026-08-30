/**
 * Soft-nav must remount setup-scope when SSR knowledge/conversation props change.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { chatShellScopeKey } from './chat-shell-scope.ts'

describe('chatShellScopeKey', () => {
  it('treats null and empty as the same empty scope', () => {
    assert.equal(chatShellScopeKey(null, null), chatShellScopeKey(undefined, undefined))
    assert.equal(chatShellScopeKey(null, null), '\0')
  })

  it('changes when knowledge or conversation changes', () => {
    let home = chatShellScopeKey(null, null)
    let kbOnly = chatShellScopeKey('kb-1', null)
    let thread = chatShellScopeKey('kb-1', 'conv-1')
    assert.notEqual(home, kbOnly)
    assert.notEqual(kbOnly, thread)
    assert.equal(chatShellScopeKey('kb-1', 'conv-1'), thread)
  })
})

/**
 * Conversation identity is path-based: /chat/:id. New chat is /.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { routes } from '../routes.ts'
import { shellChatHref, shellNewChatHref } from './chat-shell-urls.ts'

describe('shellChatHref', () => {
  it('builds /chat/:conversationId', () => {
    let id = '6aa355a0-8fc4-83ec-828c-c2faebcf9556'
    assert.equal(shellChatHref(id), routes.chat.show.href({ conversationId: id }))
    assert.equal(shellChatHref(id), `/chat/${id}`)
  })

  it('returns home when conversation id is missing', () => {
    assert.equal(shellChatHref(null), routes.home.href())
    assert.equal(shellChatHref(undefined), routes.home.href())
    assert.equal(shellChatHref(''), routes.home.href())
  })
})

describe('shellNewChatHref', () => {
  it('is always the empty chat landing', () => {
    assert.equal(shellNewChatHref(), routes.home.href())
    assert.equal(shellNewChatHref(), '/')
  })
})

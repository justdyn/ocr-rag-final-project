/**
 * Unit tests for applyChatSseFrame accumulation — characterization for the
 * Markdown pipeline swap: `content` is the canonical append-only string.
 * Pure utils — no DOM shim needed.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { applyChatSseFrame, type ChatStreamMutableState } from './chat-stream-client.ts'
import type { ChatMessage } from './chat-types.ts'

function stateWith(message: Partial<ChatMessage>): ChatStreamMutableState {
  return {
    messages: [
      {
        localId: 'asst-1',
        role: 'assistant',
        content: '',
        sources: [],
        ...message,
      } as ChatMessage,
    ],
    conversationId: null,
    conversationTitle: null,
    streamError: null,
    animateLocalIds: new Set(),
  }
}

describe('applyChatSseFrame', () => {
  it('accumulates token deltas into content verbatim', () => {
    let state = stateWith({})
    applyChatSseFrame('token', { delta: '# Heading\n\n' }, state, 0)
    applyChatSseFrame('token', { delta: 'Body **bold** [1]' }, state, 0)
    assert.equal(state.messages[0]!.content, '# Heading\n\nBody **bold** [1]')
  })

  it('records sources before tokens and keeps them across frames', () => {
    let state = stateWith({})
    applyChatSseFrame('sources', { sources: [{ id: 1, text: 'chunk' }] }, state, 0)
    applyChatSseFrame('token', { delta: 'Answer [1]' }, state, 0)
    assert.equal(state.messages[0]!.sources.length, 1)
    assert.equal(state.messages[0]!.content, 'Answer [1]')
  })

  it('sources frame can pin conversationId early (before done)', () => {
    let state = stateWith({})
    applyChatSseFrame(
      'sources',
      { sources: [{ id: 1, text: 'chunk' }], conversation_id: 'c-early' },
      state,
      0,
    )
    assert.equal(state.conversationId, 'c-early')
    assert.equal(state.messages[0]!.sources.length, 1)
  })

  it('ignores empty deltas', () => {
    let state = stateWith({ content: 'kept' })
    applyChatSseFrame('token', { delta: '' }, state, 0)
    assert.equal(state.messages[0]!.content, 'kept')
  })

  it('done sets conversationId, messageId, and the incomplete flag', () => {
    let state = stateWith({ content: 'partial answer' })
    applyChatSseFrame(
      'done',
      { conversation_id: 'c1', message_id: 'm1', incomplete: true },
      state,
      0,
    )
    assert.equal(state.conversationId, 'c1')
    assert.equal(state.messages[0]!.messageId, 'm1')
    assert.equal(state.messages[0]!.incomplete, true)
  })

  it('title frame sets conversationTitle and can pin conversationId', () => {
    let state = stateWith({})
    applyChatSseFrame(
      'title',
      { conversation_id: 'c-title', title: '  BM25 Hybrid RAG  ' },
      state,
      0,
    )
    assert.equal(state.conversationId, 'c-title')
    assert.equal(state.conversationTitle, 'BM25 Hybrid RAG')
  })

  it('title frame ignores blank titles', () => {
    let state = stateWith({})
    state.conversationTitle = 'kept'
    applyChatSseFrame('title', { conversation_id: 'c1', title: '   ' }, state, 0)
    assert.equal(state.conversationTitle, 'kept')
  })

  it('error maps a known code and flags partial content incomplete', () => {
    let state = stateWith({ content: 'partial answer' })
    applyChatSseFrame('error', { detail: 'upstream down', code: 'llm_upstream' }, state, 0)
    assert.equal(state.streamError?.code, 'llm_upstream')
    assert.equal(state.messages[0]!.incomplete, true)
  })

  it('error leaves an empty turn untouched (removed by caller)', () => {
    let state = stateWith({})
    applyChatSseFrame('error', { detail: 'nope' }, state, 0)
    assert.equal(state.streamError?.code, 'http_error')
    assert.equal(state.messages[0]!.incomplete, undefined)
  })

  it('ignores frames when the assistant index is invalid', () => {
    let state = stateWith({})
    applyChatSseFrame('token', { delta: 'x' }, state, -1)
    assert.equal(state.messages[0]!.content, '')
  })
})

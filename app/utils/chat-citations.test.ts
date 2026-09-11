/**
 * Unit tests for SSE frame buffering and citation segmentation (no router).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  crossedSentenceBoundary,
  citationFileLabel,
  segmentCitedContent,
  sourceByCitationId,
} from './chat-citations.ts'
import { consumeSseBuffer } from './sse-parse.ts'
import {
  messagesFromPersisted,
  sourcesFromPersisted,
} from './chat-types.ts'
import {
  conversationTitleFromQuery,
  upsertConversationList,
} from './new-chat.ts'

describe('consumeSseBuffer', () => {
  it('parses complete event/data frames and leaves a partial block', () => {
    let chunk =
      'event: sources\ndata: {"sources":[{"id":1}]}\n\nevent: token\ndata: {"delta":"Hi"}\n\nevent: tok'
    let { frames, rest } = consumeSseBuffer(chunk)
    assert.equal(frames.length, 2)
    assert.equal(frames[0]!.event, 'sources')
    assert.deepEqual(frames[0]!.data, { sources: [{ id: 1 }] })
    assert.equal(frames[1]!.event, 'token')
    assert.deepEqual(frames[1]!.data, { delta: 'Hi' })
    assert.equal(rest, 'event: tok')
  })

  it('parses error frames with code', () => {
    let { frames } = consumeSseBuffer(
      'event: error\ndata: {"detail":"missing key","code":"llm_not_configured"}\n\n',
    )
    assert.equal(frames.length, 1)
    assert.equal(frames[0]!.event, 'error')
    assert.deepEqual(frames[0]!.data, {
      detail: 'missing key',
      code: 'llm_not_configured',
    })
  })
})

describe('segmentCitedContent', () => {
  it('splits text around [N] markers', () => {
    let segments = segmentCitedContent('Alpha [1] beta [2][3] end.')
    assert.deepEqual(segments, [
      { type: 'text', value: 'Alpha ' },
      { type: 'citation', id: 1 },
      { type: 'text', value: ' beta ' },
      { type: 'citation', id: 2 },
      { type: 'citation', id: 3 },
      { type: 'text', value: ' end.' },
    ])
  })

  it('passes through unknown ids and leaves partial markers as text (streaming safety)', () => {
    let segments = segmentCitedContent('cite [1 and [9] unknown')
    assert.deepEqual(segments, [
      { type: 'text', value: 'cite [1 and ' },
      { type: 'citation', id: 9 },
      { type: 'text', value: ' unknown' },
    ])
    assert.equal(sourceByCitationId([], 9), undefined)
  })
})

describe('crossedSentenceBoundary', () => {
  it('detects sentence end across delta boundary', () => {
    assert.equal(crossedSentenceBoundary('Hello', '. World'), true)
    assert.equal(crossedSentenceBoundary('Hello', ' world'), false)
    assert.equal(crossedSentenceBoundary('Line', '\nmore'), true)
  })
})

describe('citationFileLabel', () => {
  it('prefers filename and falls back without crashing on older sources', () => {
    assert.equal(
      citationFileLabel({
        id: 1,
        chunk_id: 'c',
        file_id: 'f-uuid',
        text: 't',
        filename: 'notes.txt',
        rrf_score: null,
        rerank_score: null,
        extraction_method: null,
        rank: null,
      }),
      'notes.txt',
    )
    assert.equal(
      citationFileLabel({
        id: 1,
        chunk_id: 'c',
        file_id: 'f-uuid',
        text: 't',
        rrf_score: null,
        rerank_score: null,
        extraction_method: null,
        rank: null,
      }),
      'Attached file',
    )
    assert.equal(
      citationFileLabel({
        id: 1,
        chunk_id: 'c',
        file_id: 'f-uuid',
        text: 't',
        filename: '   ',
        rrf_score: null,
        rerank_score: null,
        extraction_method: null,
        rank: null,
      }),
      'Attached file',
    )
  })
})

describe('sourcesFromPersisted', () => {
  it('accepts a plain citation array', () => {
    let result = sourcesFromPersisted([{ id: 1, chunk_id: 'c', file_id: 'f', text: 't' }])
    assert.equal(result.incomplete, false)
    assert.equal(result.sources[0]?.id, 1)
  })

  it('unwraps incomplete citation wrappers', () => {
    let result = sourcesFromPersisted({
      citations: [{ id: 2 }],
      incomplete: true,
      error: 'boom',
    })
    assert.equal(result.incomplete, true)
    assert.equal(result.sources[0]?.id, 2)
  })
})

describe('messagesFromPersisted', () => {
  it('maps API rows into ChatMessage shape', () => {
    let mapped = messagesFromPersisted([
      {
        id: 'm1',
        conversation_id: 'c1',
        role: 'user',
        content: 'Hi',
        sources: null,
        created_at: 1,
      },
      {
        id: 'm2',
        conversation_id: 'c1',
        role: 'assistant',
        content: 'Hello [1]',
        sources: [{ id: 1, chunk_id: 'c', file_id: 'f', text: 'chunk' }],
        created_at: 2,
      },
    ])
    assert.equal(mapped.length, 2)
    assert.equal(mapped[0]!.localId, 'm1')
    assert.equal(mapped[1]!.messageId, 'm2')
    assert.equal(mapped[1]!.sources[0]?.id, 1)
  })
})

describe('upsertConversationList', () => {
  it('prepends within scope and replaces when knowledge changes', () => {
    let a = { id: 'a', title: 'A' }
    let b = { id: 'b', title: 'B' }
    assert.deepEqual(upsertConversationList([a], b, false), [b, a])
    assert.deepEqual(upsertConversationList([a], { id: 'a', title: 'A2' }, false), [
      { id: 'a', title: 'A2' },
    ])
    assert.deepEqual(upsertConversationList([a, b], { id: 'c', title: 'C' }, true), [
      { id: 'c', title: 'C' },
    ])
  })
})

describe('conversationTitleFromQuery', () => {
  it('truncates long queries like the backend title helper', () => {
    assert.equal(conversationTitleFromQuery('  hello   world  '), 'hello world')
    let long = 'x'.repeat(90)
    assert.equal(conversationTitleFromQuery(long).length, 80)
    assert.ok(conversationTitleFromQuery(long).endsWith('...'))
  })
})

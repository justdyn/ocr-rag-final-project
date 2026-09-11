/**
 * Unit tests for the chat attachment snapshot normalizers (chat-types.ts).
 * Pure utils — no DOM shim needed.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  attachmentIsImage,
  attachmentsFromPersisted,
  messagesFromPersisted,
  type PersistedMessage,
} from './chat-types.ts'

let snapshot = {
  file_id: 'file-1',
  filename: 'receipt.png',
  content_type: 'image/png',
  extraction_method: 'ocr:tesseract',
  ocr_confidence: 91.5,
  text_excerpt: 'alpha',
}

describe('attachmentsFromPersisted', () => {
  it('passes valid snapshots through unchanged', () => {
    assert.deepEqual(attachmentsFromPersisted([snapshot]), [snapshot])
  })

  it('returns [] for non-arrays and drops junk entries', () => {
    assert.deepEqual(attachmentsFromPersisted(null), [])
    assert.deepEqual(attachmentsFromPersisted('nope'), [])
    assert.deepEqual(attachmentsFromPersisted({ citations: [] }), [])
    let out = attachmentsFromPersisted([
      null,
      42,
      { filename: 'missing-id.txt' },
      { file_id: 'f2', filename: 'ok.txt' },
    ])
    assert.deepEqual(out, [
      { file_id: 'f2', filename: 'ok.txt', content_type: null, extraction_method: null, ocr_confidence: null, text_excerpt: null },
    ])
  })

  it('coerces wrong-typed fields to null', () => {
    let [row] = attachmentsFromPersisted([
      {
        file_id: 'f3',
        filename: 'a.txt',
        content_type: 7,
        extraction_method: [],
        ocr_confidence: 'high',
        text_excerpt: 99,
      },
    ])
    assert.equal(row.content_type, null)
    assert.equal(row.extraction_method, null)
    assert.equal(row.ocr_confidence, null)
    assert.equal(row.text_excerpt, null)
  })
})

describe('attachmentIsImage', () => {
  it('lets content_type win and falls back to the filename', () => {
    assert.equal(attachmentIsImage({ ...snapshot, content_type: 'image/png' }), true)
    assert.equal(
      attachmentIsImage({ ...snapshot, content_type: null, filename: 'notes.txt' }),
      false,
    )
    assert.equal(
      attachmentIsImage({ ...snapshot, content_type: null, filename: 'photo.JPG' }),
      true,
    )
    assert.equal(
      attachmentIsImage({ ...snapshot, content_type: 'application/pdf', filename: 'weird.png' }),
      false,
    )
  })
})

describe('messagesFromPersisted — attachments', () => {
  it('maps snapshots onto user turns; assistant rows stay attachment-free', () => {
    let rows: PersistedMessage[] = [
      { id: 'u1', conversation_id: 'c1', role: 'user', content: 'hello', sources: null, attachments: [snapshot], created_at: 1 },
      { id: 'a1', conversation_id: 'c1', role: 'assistant', content: 'hi', sources: [], attachments: null, created_at: 2 },
      { id: 'u2', conversation_id: 'c1', role: 'user', content: 'legacy', sources: null, created_at: 3 },
    ]
    let messages = messagesFromPersisted(rows)
    assert.equal(messages.length, 3)
    assert.deepEqual(messages[0].attachments, [snapshot])
    assert.equal(messages[1].attachments, undefined)
    assert.equal(messages[1].messageId, 'a1')
    assert.equal(messages[2].attachments, undefined)
  })

  it('collapses empty attachment arrays to undefined', () => {
    let messages = messagesFromPersisted([
      { id: 'u3', conversation_id: 'c1', role: 'user', content: 'x', sources: null, attachments: [], created_at: 4 },
    ])
    assert.equal(messages[0].attachments, undefined)
  })
})
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  attachmentKind,
  isImageAttachment,
  isImageAttachmentName,
  isUnpersistedUpload,
  previewStateForRow,
  previewUrlForAttachment,
  revokePreviewUrl,
  sentAttachmentsFrom,
  type ComposerAttachment,
} from './composer-attachments.ts'

describe('isImageAttachmentName', () => {
  it('treats png/jpg/jpeg as image previews', () => {
    assert.equal(isImageAttachmentName('scan.PNG'), true)
    assert.equal(isImageAttachmentName('photo.jpg'), true)
    assert.equal(isImageAttachmentName('notes.txt'), false)
    assert.equal(isImageAttachmentName('paper.pdf'), false)
  })
})

describe('isImageAttachment', () => {
  it('accepts image MIME even when the name is odd', () => {
    assert.equal(isImageAttachment({ name: 'blob', type: 'image/png' }), true)
    assert.equal(isImageAttachment({ name: 'notes.txt', type: 'text/plain' }), false)
  })
})

describe('attachmentKind', () => {
  it('maps by image flag then extension', () => {
    assert.equal(attachmentKind({ image: true, filename: 'x.bin' }), 'image')
    assert.equal(attachmentKind({ image: false, filename: 'paper.PDF' }), 'pdf')
    assert.equal(attachmentKind({ image: false, filename: 'notes.txt' }), 'text')
    assert.equal(attachmentKind({ image: false, filename: 'readme.md' }), 'text')
    assert.equal(attachmentKind({ image: false, filename: 'blob' }), 'other')
  })
})

describe('previewUrlForAttachment', () => {
  it('prefers the pick-time image blob URL', () => {
    assert.equal(
      previewUrlForAttachment({
        localId: 'a',
        filename: 'p.png',
        fileId: null,
        status: 'ready',
        error: null,
        previewUrl: 'blob:p',
        image: true,
      }),
      'blob:p',
    )
  })

  it('returns null when no URL and no draft file (no empty modal)', () => {
    assert.equal(
      previewUrlForAttachment({
        localId: 'b',
        filename: 'paper.pdf',
        fileId: 'file-1',
        status: 'ready',
        error: null,
      }),
      null,
    )
  })
})

describe('previewStateForRow', () => {
  it('is null when the row has no renderable URL (gate closed)', () => {
    assert.equal(
      previewStateForRow({
        localId: 'b',
        filename: 'paper.pdf',
        fileId: 'file-1',
        status: 'ready',
        error: null,
      }),
      null,
    )
  })

  it('reuses the pick-time image blob URL without owning it', () => {
    assert.deepEqual(
      previewStateForRow({
        localId: 'a',
        filename: 'p.png',
        fileId: null,
        status: 'ready',
        error: null,
        previewUrl: 'blob:p',
        image: true,
      }),
      { localId: 'a', url: 'blob:p', owned: false },
    )
  })

  it('mints an owned blob URL from the retained draft file', () => {
    let file = new File(['%PDF-1.4 test pdf'], 'paper.pdf', { type: 'application/pdf' })
    let state = previewStateForRow({
      localId: 'c',
      filename: 'paper.pdf',
      fileId: 'file-1',
      status: 'ready',
      error: null,
      file,
    })
    assert.ok(state)
    assert.match(state.url, /^blob:/)
    assert.equal(state.owned, true)
    revokePreviewUrl(state.url)
  })
})

describe('isUnpersistedUpload', () => {
  it('is true only while XHR is in flight with no file id', () => {
    assert.equal(
      isUnpersistedUpload({
        localId: 'a',
        filename: 'notes.txt',
        fileId: null,
        status: 'uploading',
        error: null,
      }),
      true,
    )
    assert.equal(
      isUnpersistedUpload({
        localId: 'b',
        filename: 'notes.txt',
        fileId: 'file-1',
        status: 'ready',
        error: null,
      }),
      false,
    )
  })
})

describe('sentAttachmentsFrom', () => {
  it('captures only ready rows that carry a file id', () => {
    let rows: ComposerAttachment[] = [
      { localId: 'a', filename: 'p.png', fileId: 'file-1', status: 'ready', error: null, image: true },
      { localId: 'b', filename: 'paper.pdf', fileId: 'file-2', status: 'uploading', error: null },
      { localId: 'c', filename: 'notes.txt', fileId: null, status: 'ready', error: null },
      { localId: 'd', filename: 'x.txt', fileId: 'file-3', status: 'failed', error: 'boom' },
    ]
    assert.deepEqual(sentAttachmentsFrom(rows), [
      { fileId: 'file-1', filename: 'p.png' },
    ])
  })

  it('returns [] when nothing is ready', () => {
    assert.deepEqual(sentAttachmentsFrom([]), [])
  })
})

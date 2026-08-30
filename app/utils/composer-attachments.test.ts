import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  isImageAttachment,
  isImageAttachmentName,
  isUnpersistedUpload,
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

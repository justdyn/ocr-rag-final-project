/**
 * Client upload pre-check — UX only; server still enforces type/size/content.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  formatFileError,
  formatUploadError,
  MAX_UPLOAD_BYTES,
  validateClientUpload,
} from './file-errors.ts'

describe('validateClientUpload', () => {
  it('accepts an allowlisted name under the size cap', () => {
    assert.equal(validateClientUpload({ name: 'notes.txt', size: 12 }), null)
    assert.equal(validateClientUpload({ name: 'Scan.PDF', size: 1024 }), null)
  })

  it('accepts Office document extensions', () => {
    assert.equal(validateClientUpload({ name: 'report.docx', size: 1024 }), null)
    assert.equal(validateClientUpload({ name: 'deck.pptx', size: 1024 }), null)
    assert.equal(validateClientUpload({ name: 'book.xlsx', size: 1024 }), null)
  })

  it('rejects a zero-byte file before any network call', () => {
    assert.match(validateClientUpload({ name: 'notes.txt', size: 0 }) ?? '', /empty/i)
  })

  it('rejects a disallowed extension before any network call', () => {
    assert.match(validateClientUpload({ name: 'payload.exe', size: 10 }) ?? '', /Unsupported type/)
  })

  it('rejects a file over 25 MiB before any network call', () => {
    assert.match(
      validateClientUpload({ name: 'notes.txt', size: MAX_UPLOAD_BYTES + 1 }) ?? '',
      /25 MiB/,
    )
  })
})

describe('formatFileError', () => {
  it('maps empty_content to a dedicated sentence, not the fallback', () => {
    assert.equal(formatFileError('empty_content'), 'No text could be extracted from this file.')
    assert.notEqual(formatFileError('empty_content'), 'Processing failed (empty_content).')
  })

  it('maps known office codes and keeps the fallback for unknown ones', () => {
    assert.match(formatFileError('ooxml_read_error') ?? '', /corrupted/i)
    assert.match(formatFileError('file_content_mismatch') ?? '', /do not match/i)
    assert.equal(formatFileError('mystery'), 'Processing failed (mystery).')
  })
})

describe('formatUploadError', () => {
  it('maps file_content_mismatch and leaves human BFF messages intact', () => {
    assert.match(formatUploadError('file_content_mismatch'), /do not match/i)
    assert.equal(formatUploadError('Upload failed.'), 'Upload failed.')
  })
})

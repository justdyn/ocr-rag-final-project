/**
 * Client upload pre-check — UX only; server still enforces type/size/content.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  formatUploadError,
  MAX_UPLOAD_BYTES,
  validateClientUpload,
} from './file-errors.ts'

describe('validateClientUpload', () => {
  it('accepts an allowlisted name under the size cap', () => {
    assert.equal(validateClientUpload({ name: 'notes.txt', size: 12 }), null)
    assert.equal(validateClientUpload({ name: 'Scan.PDF', size: 1024 }), null)
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

describe('formatUploadError', () => {
  it('maps file_content_mismatch and leaves human BFF messages intact', () => {
    assert.match(formatUploadError('file_content_mismatch'), /do not match/i)
    assert.equal(formatUploadError('Upload failed.'), 'Upload failed.')
  })
})

/**
 * Multipart limit-error mapping — size limits are 413, the rest are 400.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  MaxFilesExceededError,
  MaxFileSizeExceededError,
  MaxHeaderSizeExceededError,
  MaxPartsExceededError,
  MaxTotalSizeExceededError,
} from 'remix/form-data-parser'

import { multipartErrorResponse } from './form-data.ts'
import { MAX_UPLOAD_BYTES, UPLOAD_PARSE_ERROR, UPLOAD_SIZE_ERROR } from '../utils/file-errors.ts'

describe('multipartErrorResponse', () => {
  it('maps size limits to 413 with the size copy', async () => {
    let errors = [
      new MaxFileSizeExceededError(MAX_UPLOAD_BYTES + 1),
      new MaxTotalSizeExceededError(MAX_UPLOAD_BYTES + 1024 * 1024),
    ]
    for (let error of errors) {
      let response = multipartErrorResponse(error)
      assert.equal(response?.status, 413)
      assert.deepEqual(await response?.json(), { error: UPLOAD_SIZE_ERROR })
    }
  })

  it('maps files/parts/header limits to 400 with the non-size copy', async () => {
    let errors = [
      new MaxFilesExceededError(20),
      new MaxPartsExceededError(1000),
      new MaxHeaderSizeExceededError(16384),
    ]
    for (let error of errors) {
      let response = multipartErrorResponse(error)
      assert.equal(response?.status, 400)
      assert.deepEqual(await response?.json(), { error: UPLOAD_PARSE_ERROR })
    }
  })

  it('passes unknown errors through', () => {
    assert.equal(multipartErrorResponse(new Error('boom')), null)
  })
})

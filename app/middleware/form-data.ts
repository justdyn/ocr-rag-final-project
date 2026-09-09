/**
 * App-wide form-data parsing with the product upload limit (25 MiB) instead of
 * the parser default (2 MiB), and JSON error responses for multipart limit
 * errors — they must never reach server.ts, which answers plain-text 500.
 */
import { formData } from 'remix/middleware/form-data'
import type { Middleware } from 'remix/router'
import {
  MaxFilesExceededError,
  MaxFileSizeExceededError,
  MaxHeaderSizeExceededError,
  MaxPartsExceededError,
  MaxTotalSizeExceededError,
} from 'remix/form-data-parser'

import {
  MAX_UPLOAD_BYTES,
  UPLOAD_PARSE_ERROR,
  UPLOAD_SIZE_ERROR,
} from '../utils/file-errors.ts'

type FormDataMiddleware = Middleware<{
  key: typeof FormData
  value: FormData
  property: 'formData'
}>

/** 413 for size limits; 400 for the other multipart limits; null passes through. */
export function multipartErrorResponse(error: unknown): Response | null {
  if (error instanceof MaxFileSizeExceededError || error instanceof MaxTotalSizeExceededError) {
    return Response.json({ error: UPLOAD_SIZE_ERROR }, { status: 413 })
  }
  if (
    error instanceof MaxFilesExceededError ||
    error instanceof MaxPartsExceededError ||
    error instanceof MaxHeaderSizeExceededError
  ) {
    return Response.json({ error: UPLOAD_PARSE_ERROR }, { status: 400 })
  }
  return null
}

export function uploadFormData(): FormDataMiddleware {
  let inner = formData({
    maxFileSize: MAX_UPLOAD_BYTES,
    // One full-size file plus form fields (parser default would be 20x maxFileSize).
    maxTotalSize: MAX_UPLOAD_BYTES + 1024 * 1024,
  })
  return async (context, next) => {
    try {
      return await inner(context, next)
    } catch (error) {
      let response = multipartErrorResponse(error)
      if (response) return response
      throw error
    }
  }
}

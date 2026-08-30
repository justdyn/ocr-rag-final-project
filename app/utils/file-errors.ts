/**
 * Human-readable messages for file.meta.error codes from the ingestion pipeline.
 * Pure mapping → utils/ (no actions/ui/response imports).
 */

const FILE_ERROR_MESSAGES: Record<string, string> = {
  tesseract_not_found:
    'OCR is unavailable: Tesseract is not installed on the server. Text-layer PDFs and plain text still work; scanned images need Tesseract.',
  unsupported_type: 'This file type is not supported. Use PDF, TXT, MD, PNG, or JPG.',
  empty_file: 'The uploaded file was empty.',
  extraction_failed: 'Text extraction failed for this file.',
  embedding_failed: 'Embedding failed after extraction. Try reprocessing later.',
  file_content_mismatch:
    'File contents do not match the filename extension. Rename was not enough — the bytes must match PDF, PNG, JPEG, or text.',
}

export const UPLOAD_TYPE_ERROR = 'Unsupported type. Use PDF, TXT, MD, PNG, or JPG.'
export const UPLOAD_SIZE_ERROR = 'File is larger than the 25 MiB limit.'

export function formatFileError(error: string | null | undefined): string | null {
  if (!error) return null
  return FILE_ERROR_MESSAGES[error] ?? `Processing failed (${error}).`
}

export const ACCEPTED_UPLOAD_EXTENSIONS = [
  '.pdf',
  '.txt',
  '.md',
  '.png',
  '.jpg',
  '.jpeg',
] as const

export const ACCEPTED_UPLOAD_ACCEPT =
  '.pdf,.txt,.md,.png,.jpg,.jpeg,application/pdf,text/plain,text/markdown,image/png,image/jpeg'

/** Matches backend MAX_UPLOAD_BYTES default (25 MiB). */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

export function isAcceptedUploadName(filename: string): boolean {
  let lower = filename.toLowerCase()
  return ACCEPTED_UPLOAD_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/** Client UX pre-check only — the server still enforces type, size, and content. */
export function validateClientUpload(file: { name: string; size: number }): string | null {
  if (!isAcceptedUploadName(file.name)) return UPLOAD_TYPE_ERROR
  if (file.size > MAX_UPLOAD_BYTES) return UPLOAD_SIZE_ERROR
  return null
}

/** Map known error codes; leave already-human BFF messages unchanged. */
export function formatUploadError(error: string): string {
  return FILE_ERROR_MESSAGES[error] ?? error
}

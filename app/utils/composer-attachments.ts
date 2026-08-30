export type ComposerAttachmentStatus =
  | 'uploading'
  | 'pending'
  | 'processing'
  | 'ready'
  | 'failed'

export type ComposerAttachment = {
  localId: string
  filename: string
  fileId: string | null
  status: ComposerAttachmentStatus
  error: string | null
  previewUrl?: string | null
  image?: boolean
}

export function isImageAttachmentName(filename: string): boolean {
  let lower = filename.toLowerCase()
  return lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg')
}

export function isImageAttachment(file: { name: string; type?: string }): boolean {
  if (file.type && file.type.startsWith('image/')) return true
  return isImageAttachmentName(file.name)
}

export function previewUrlForFile(file: File): string | null {
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  if (!isImageAttachment(file)) return null
  return URL.createObjectURL(file)
}

export function revokePreviewUrl(url: string | null | undefined): void {
  if (!url || typeof URL === 'undefined' || typeof URL.revokeObjectURL !== 'function') return
  URL.revokeObjectURL(url)
}

export function isTerminalAttachmentStatus(
  status: ComposerAttachmentStatus,
): boolean {
  return status === 'ready' || status === 'failed'
}

export function isActiveAttachmentStatus(
  status: ComposerAttachmentStatus,
): boolean {
  return status === 'uploading' || status === 'pending' || status === 'processing'
}

export function readyAttachmentFileIds(rows: ComposerAttachment[]): string[] {
  return rows
    .filter((row) => row.status === 'ready' && row.fileId)
    .map((row) => row.fileId as string)
}

export function summarizeAttachments(rows: ComposerAttachment[]): string {
  return rows
    .map((row) => {
      if (row.status === 'failed') {
        return `${row.filename}: failed${row.error ? ` (${row.error})` : ''}`
      }
      if (row.status === 'ready') return `${row.filename}: ready`
      if (row.status === 'processing') return `${row.filename}: processing…`
      if (row.status === 'uploading') return `${row.filename}: uploading…`
      return `${row.filename}: pending`
    })
    .join(' · ')
}

export function asAttachmentStatus(
  status: string,
): ComposerAttachmentStatus {
  if (
    status === 'uploading' ||
    status === 'pending' ||
    status === 'processing' ||
    status === 'ready' ||
    status === 'failed'
  ) {
    return status
  }
  return 'pending'
}

/** Still in XHR; nothing persisted — abort, do not call DELETE. */
export function isUnpersistedUpload(row: ComposerAttachment): boolean {
  return row.status === 'uploading' && row.fileId == null
}

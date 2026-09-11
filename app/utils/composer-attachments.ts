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
  /** Draft-only handle on the picked file — preview blob URLs come from this. */
  file?: File | null
}

export type AttachmentKind = 'image' | 'pdf' | 'text' | 'other'

export type AttachmentPreview = {
  filename: string
  kind: AttachmentKind
  url: string
  status: ComposerAttachmentStatus
  error: string | null
}

/** Open-modal state while a previewable row is shown — null means do not open. */
export type AttachmentPreviewState = {
  localId: string
  url: string
  owned: boolean
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

/** Preview class for a row — extension-based, mirrors isImageAttachmentName. */
export function attachmentKind(row: Pick<ComposerAttachment, 'image' | 'filename'>): AttachmentKind {
  if (row.image) return 'image'
  let lower = row.filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.txt') || lower.endsWith('.md')) return 'text'
  return 'other'
}

/**
 * URL the preview modal can render: the image blob URL created at pick time,
 * else a fresh object URL from the retained draft file (pdf/text). Returns
 * null when nothing previewable exists — callers must not open an empty modal.
 */
export function previewUrlForAttachment(row: ComposerAttachment): string | null {
  if (row.previewUrl) return row.previewUrl
  let kind = attachmentKind(row)
  if (kind === 'other' || !row.file) return null
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') return null
  return URL.createObjectURL(row.file)
}

/**
 * Preview-open gate: null when the row has no renderable URL — callers must
 * not open the modal. `owned` marks blob URLs created here (revoked on close).
 */
export function previewStateForRow(row: ComposerAttachment): AttachmentPreviewState | null {
  let url = previewUrlForAttachment(row)
  if (!url) return null
  return { localId: row.localId, url, owned: url !== row.previewUrl }
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

/** File summary captured at send time — before releaseDraftStrip clears the strip. */
export type SentAttachment = { fileId: string; filename: string }

export function sentAttachmentsFrom(rows: ComposerAttachment[]): SentAttachment[] {
  return rows
    .filter((row) => row.status === 'ready' && row.fileId)
    .map((row) => ({ fileId: row.fileId as string, filename: row.filename }))
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

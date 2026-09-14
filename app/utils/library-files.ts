/**
 * Library list helpers — filename filter, image/documents tabs, relative activity.
 */
import type { FileMeta, LibraryFileType } from './file-types.ts'

export type { LibraryFileType }

export function fileContentType(meta: FileMeta | null | undefined): string | null {
  if (!meta) return null
  let raw = meta.content_type ?? meta.contentType ?? meta.mime_type
  return typeof raw === 'string' ? raw : null
}

export function libraryFileIsImage(file: {
  filename: string
  meta?: FileMeta | null
}): boolean {
  let type = fileContentType(file.meta)
  if (type?.startsWith('image/')) return true
  let lower = file.filename.toLowerCase()
  return (
    lower.endsWith('.png') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp')
  )
}

/** Non-image owner files (PDF, text, office, etc.). */
export function libraryFileIsDocument(file: {
  filename: string
  meta?: FileMeta | null
}): boolean {
  return !libraryFileIsImage(file)
}

export function filterLibraryFiles<T extends { filename: string; meta?: FileMeta | null }>(
  files: T[],
  opts: { query: string; tab: LibraryFileType },
): T[] {
  let q = opts.query.trim().toLowerCase()
  return files.filter((file) => {
    if (opts.tab === 'images' && !libraryFileIsImage(file)) return false
    if (opts.tab === 'documents' && !libraryFileIsDocument(file)) return false
    if (q && !file.filename.toLowerCase().includes(q)) return false
    return true
  })
}

/** unix seconds → "Modified 18h ago" style label. */
export function formatLibraryActivity(
  updatedAt: number,
  nowMs: number = Date.now(),
): string {
  let diffSec = Math.max(0, Math.floor(nowMs / 1000) - updatedAt)
  if (diffSec < 60) return 'Modified just now'
  let mins = Math.floor(diffSec / 60)
  if (mins < 60) return `Modified ${mins}m ago`
  let hours = Math.floor(mins / 60)
  if (hours < 48) return `Modified ${hours}h ago`
  let days = Math.floor(hours / 24)
  if (days < 60) return `Modified ${days}d ago`
  let months = Math.floor(days / 30)
  if (months < 24) return `Modified ${months}mo ago`
  let years = Math.floor(days / 365)
  return `Modified ${years}y ago`
}

export function libraryFileKind(file: {
  filename: string
  meta?: FileMeta | null
}): 'image' | 'pdf' | 'doc' | 'other' {
  if (libraryFileIsImage(file)) return 'image'
  let lower = file.filename.toLowerCase()
  if (lower.endsWith('.pdf')) return 'pdf'
  if (lower.endsWith('.doc') || lower.endsWith('.docx')) return 'doc'
  let type = fileContentType(file.meta)
  if (type === 'application/pdf') return 'pdf'
  if (type?.includes('word') || type?.includes('document')) return 'doc'
  return 'other'
}

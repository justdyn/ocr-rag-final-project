/**
 * Files API client for FastAPI `/api/files/*`.
 * data/ owns server fetch — do not import this module from clientEntry code.
 */
import { backendFetch } from './backend.ts'
import type {
  FileFieldsRecord,
  FileListPage,
  FileListParams,
  FileRecord,
  FileStatusRecord,
  LibraryFileType,
} from '../utils/file-types.ts'

export type {
  FileFieldsRecord,
  FileListPage,
  FileListParams,
  FileRecord,
  FileStatusRecord,
  FileStatusValue,
  LibraryFileType,
} from '../utils/file-types.ts'
export { isActiveStatus } from '../utils/file-types.ts'

export class FilesApiError extends Error {
  readonly status: number
  readonly code: string

  constructor(message: string, status: number, code = 'upload_failed') {
    super(message)
    this.status = status
    this.code = code
  }
}

async function readDetail(response: Response): Promise<string> {
  try {
    let body = (await response.json()) as { detail?: unknown; error?: unknown }
    if (typeof body.error === 'string') return body.error
    if (typeof body.detail === 'string') return body.detail
    return response.statusText || 'Request failed'
  } catch {
    return response.statusText || 'Request failed'
  }
}

export async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return
  let message = await readDetail(response)
  throw new FilesApiError(message, response.status, message)
}

const FILE_TYPES = new Set<LibraryFileType>(['all', 'images', 'documents'])

export function buildFilesListQuery(params: FileListParams = {}): string {
  let search = new URLSearchParams()
  let page = Math.max(1, params.page ?? 1)
  let limit = Math.min(100, Math.max(1, params.limit ?? 10))
  search.set('page', String(page))
  search.set('limit', String(limit))
  if (params.q?.trim()) search.set('q', params.q.trim())
  let type = params.type ?? 'all'
  if (FILE_TYPES.has(type) && type !== 'all') search.set('type', type)
  return `?${search.toString()}`
}

export async function listFiles(
  accessToken: string,
  params: FileListParams = {},
): Promise<FileListPage> {
  let response = await backendFetch(`/api/files${buildFilesListQuery(params)}`, {
    method: 'GET',
    accessToken,
  })
  await throwIfNotOk(response)
  let body = (await response.json()) as FileListPage
  return {
    items: Array.isArray(body.items) ? body.items : [],
    page: typeof body.page === 'number' ? body.page : (params.page ?? 1),
    limit: typeof body.limit === 'number' ? body.limit : (params.limit ?? 10),
    total: typeof body.total === 'number' ? body.total : 0,
    has_more: Boolean(body.has_more),
  }
}

export async function uploadFile(
  accessToken: string,
  file: File,
): Promise<FileRecord> {
  let body = new FormData()
  body.append('file', file, file.name)

  let response = await backendFetch('/api/files', {
    method: 'POST',
    body,
    accessToken,
  })
  await throwIfNotOk(response)
  return (await response.json()) as FileRecord
}

export async function getFileStatus(
  accessToken: string,
  fileId: string,
): Promise<FileStatusRecord> {
  let response = await backendFetch(`/api/files/${fileId}/status`, {
    method: 'GET',
    accessToken,
  })
  await throwIfNotOk(response)
  return (await response.json()) as FileStatusRecord
}

export async function getFileFields(
  accessToken: string,
  fileId: string,
): Promise<FileFieldsRecord> {
  let response = await backendFetch(`/api/files/${fileId}/fields`, {
    method: 'GET',
    accessToken,
  })
  await throwIfNotOk(response)
  return (await response.json()) as FileFieldsRecord
}

export async function deleteFile(
  accessToken: string,
  fileId: string,
): Promise<void> {
  let response = await backendFetch(`/api/files/${fileId}`, {
    method: 'DELETE',
    accessToken,
  })
  if (!response.ok && response.status !== 204) {
    await throwIfNotOk(response)
  }
}

/**
 * Raw blob passthrough for attachment thumbnails/modals — returns the upstream
 * Response unbuffered; the controller re-streams its body. Never consume the
 * body here (the controller needs it).
 */
export async function getFileContent(
  accessToken: string,
  fileId: string,
): Promise<Response> {
  return backendFetch(`/api/files/${fileId}/content`, {
    method: 'GET',
    accessToken,
  })
}

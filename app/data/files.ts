/**
 * Files API client for FastAPI `/api/files/*`.
 * data/ owns server fetch — do not import this module from clientEntry code.
 */
import { backendFetch } from './backend.ts'
import type { FileRecord, FileStatusRecord } from '../utils/file-types.ts'

export type { FileRecord, FileStatusRecord, FileStatusValue } from '../utils/file-types.ts'
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

async function throwIfNotOk(response: Response): Promise<void> {
  if (response.ok) return
  let message = await readDetail(response)
  throw new FilesApiError(message, response.status, message)
}

export async function listFiles(accessToken: string): Promise<FileRecord[]> {
  let response = await backendFetch('/api/files', {
    method: 'GET',
    accessToken,
  })
  await throwIfNotOk(response)
  return (await response.json()) as FileRecord[]
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

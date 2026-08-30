/**
 * Browser helper for the Remix BFF upload/status/delete routes.
 * XHR (not fetch) so `upload.onprogress` can drive the composer ring.
 * Must not import app/data (server-only FastAPI client).
 */
import { routes } from '../routes.ts'
import { formatUploadError } from './file-errors.ts'
import type { FileRecord, FileStatusRecord } from './file-types.ts'

export const FILE_STATUS_POLL_MS = 2000

export type LibraryUploadResult =
  | { ok: true; file: FileRecord }
  | { ok: false; error: string; aborted?: boolean }

export type LibraryUploadHandle = {
  abort: () => void
  done: Promise<LibraryUploadResult>
}

export type UploadProgressHandler = (fraction: number) => void

export function postLibraryUpload(
  file: File,
  onProgress?: UploadProgressHandler,
): LibraryUploadHandle {
  let body = new FormData()
  body.append('file', file, file.name)
  let url = routes.files.upload.href()
  return uploadWithProgress(url, body, onProgress)
}

function uploadWithProgress(
  url: string,
  body: FormData,
  onProgress?: UploadProgressHandler,
): LibraryUploadHandle {
  let xhr = new XMLHttpRequest()
  let done = new Promise<LibraryUploadResult>((resolve) => {
    xhr.open('POST', url)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.withCredentials = true

    xhr.upload.onprogress = (event) => {
      if (!onProgress) return
      if (!event.lengthComputable || event.total <= 0) return
      let fraction = event.loaded / event.total
      // Completion is emitted once from onload so 100% is not double-fired.
      if (fraction >= 1) return
      onProgress(fraction)
    }

    xhr.onload = () => {
      onProgress?.(1)
      let parsed: { file?: FileRecord; error?: string }
      try {
        parsed = JSON.parse(xhr.responseText) as { file?: FileRecord; error?: string }
      } catch {
        resolve({ ok: false, error: 'Upload failed. Check your connection and try again.' })
        return
      }
      if (xhr.status < 200 || xhr.status >= 300 || !parsed.file) {
        resolve({
          ok: false,
          error: formatUploadError(parsed.error ?? 'Upload failed.'),
        })
        return
      }
      resolve({ ok: true, file: parsed.file })
    }

    xhr.onerror = () =>
      resolve({ ok: false, error: 'Upload failed. Check your connection and try again.' })
    xhr.onabort = () => resolve({ ok: false, error: 'aborted', aborted: true })
    xhr.send(body)
  })

  return {
    abort: () => xhr.abort(),
    done,
  }
}

export async function deleteLibraryFile(fileId: string): Promise<{ ok: boolean }> {
  try {
    let response = await fetch(routes.files.destroy.href({ fileId }), {
      method: 'DELETE',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    })
    return { ok: response.ok || response.status === 204 }
  } catch {
    return { ok: false }
  }
}

export async function fetchFileStatus(fileId: string): Promise<FileStatusRecord | null> {
  try {
    let response = await fetch(routes.files.status.href({ fileId }), {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    return (await response.json()) as FileStatusRecord
  } catch {
    return null
  }
}

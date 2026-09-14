/**
 * Files BFF — upload/status/list/content/delete for composer + Library.
 * GET /files redirects to /library.
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import {
  deleteFile,
  FilesApiError,
  getFileContent,
  getFileStatus,
  listFiles,
  uploadFile,
  type FileRecord,
  type LibraryFileType,
} from '../../data/files.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'
import { MAX_UPLOAD_BYTES, validateClientUpload } from '../../utils/file-errors.ts'

function asUploadFile(value: FormDataEntryValue | null): File | null {
  if (value == null || typeof value === 'string') return null
  if (typeof File !== 'undefined' && value instanceof File) return value
  let blob = value as Blob & { name?: string }
  if (typeof blob.arrayBuffer !== 'function') return null
  let name = typeof blob.name === 'string' && blob.name.length > 0 ? blob.name : 'upload.bin'
  return new File([blob], name, {
    type: blob.type || 'application/octet-stream',
  })
}

function parseListParams(request: Request): {
  q?: string
  type: LibraryFileType
  page: number
  limit: number
} {
  let url = new URL(request.url)
  let q = url.searchParams.get('q') ?? undefined
  let typeRaw = url.searchParams.get('type') ?? 'all'
  let type: LibraryFileType =
    typeRaw === 'images' || typeRaw === 'documents' ? typeRaw : 'all'
  let pageRaw = url.searchParams.get('page')
  let limitRaw = url.searchParams.get('limit')
  let page =
    pageRaw != null && pageRaw !== '' && Number.isFinite(Number(pageRaw))
      ? Math.max(1, Math.trunc(Number(pageRaw)))
      : 1
  let limit =
    limitRaw != null && limitRaw !== '' && Number.isFinite(Number(limitRaw))
      ? Math.min(100, Math.max(1, Math.trunc(Number(limitRaw))))
      : 10
  return { q, type, page, limit }
}

export default createController(routes.files, {
  actions: {
    async index() {
      return redirect(routes.library.index.href(), 303)
    },

    async list({ session, request }) {
      let auth = requireAuthFromSession(session, routes.library.index.href())
      if (auth instanceof Response) return auth

      try {
        let page = await listFiles(auth, parseListParams(request))
        return Response.json(page)
      } catch (error) {
        if (error instanceof FilesApiError && error.status < 500) {
          return Response.json({ error: error.message }, { status: error.status })
        }
        let message = error instanceof Error ? error.message : 'List files failed.'
        return Response.json({ error: message }, { status: 502 })
      }
    },

    async upload({ get, session }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      let formData = get(FormData)
      let file = asUploadFile(formData.get('file'))
      if (!file) {
        return Response.json({ error: 'Choose a file to upload.' }, { status: 400 })
      }
      let rejection = validateClientUpload(file)
      if (rejection) {
        // Oversize matches FastAPI's 413; everything else stays 400.
        return Response.json(
          { error: rejection },
          { status: file.size > MAX_UPLOAD_BYTES ? 413 : 400 },
        )
      }

      try {
        let record: FileRecord = await uploadFile(auth, file)
        return Response.json({ file: record }, { status: 201 })
      } catch (error) {
        if (error instanceof FilesApiError && error.status < 500) {
          return Response.json({ error: error.message }, { status: error.status })
        }
        let message = error instanceof Error ? error.message : 'Upload failed.'
        return Response.json({ error: message }, { status: 502 })
      }
    },

    async status({ session, params }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      try {
        let status = await getFileStatus(auth, params.fileId)
        return Response.json(status)
      } catch (error) {
        if (error instanceof FilesApiError && error.status < 500) {
          return Response.json({ error: error.message }, { status: error.status })
        }
        let message = error instanceof Error ? error.message : 'Status check failed.'
        return Response.json({ error: message }, { status: 502 })
      }
    },

    async content({ session, params }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      try {
        let upstream = await getFileContent(auth, params.fileId)
        if (!upstream.ok) {
          // Error bodies are tiny JSON — buffer and pass status/detail through.
          let detail = await upstream.text()
          return new Response(detail, {
            status: upstream.status,
            headers: {
              'Content-Type':
                upstream.headers.get('Content-Type') ?? 'application/json',
            },
          })
        }
        // Blob passthrough: stream the upstream body without buffering it.
        return new Response(upstream.body, {
          status: 200,
          headers: {
            'Content-Type':
              upstream.headers.get('Content-Type') ?? 'application/octet-stream',
            'Cache-Control': 'private, max-age=300',
          },
        })
      } catch (error) {
        let message = error instanceof Error ? error.message : 'File content failed.'
        return Response.json({ error: message }, { status: 502 })
      }
    },

    async destroy({ session, params }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      try {
        await deleteFile(auth, params.fileId)
        return new Response(null, { status: 204 })
      } catch (error) {
        if (error instanceof FilesApiError && error.status < 500) {
          return Response.json({ error: error.message }, { status: error.status })
        }
        let message = error instanceof Error ? error.message : 'Delete failed.'
        return Response.json({ error: message }, { status: 502 })
      }
    },
  },
})

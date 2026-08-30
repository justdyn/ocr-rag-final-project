/**
 * Files BFF — upload + status for composer attach only.
 * GET /files redirects home (library page removed).
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import {
  deleteFile,
  FilesApiError,
  getFileStatus,
  uploadFile,
  type FileRecord,
} from '../../data/files.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'
import { validateClientUpload } from '../../utils/file-errors.ts'

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

export default createController(routes.files, {
  actions: {
    async index() {
      return redirect(routes.home.href(), 303)
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
        return Response.json({ error: rejection }, { status: 400 })
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

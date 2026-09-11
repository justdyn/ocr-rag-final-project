/**
 * Files BFF after library-page removal: upload/status kept; GET /files redirects home.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { ACCESS_TOKEN_KEY, sessionCookie, sessionStorage } from '../../middleware/session.ts'
import { formatFileError } from '../../utils/file-errors.ts'

const MOCK_TOKEN = 'files-step.jwt.token'

let originalFetch = globalThis.fetch
let fileStore: Array<{
  id: string
  filename: string
  status: string
  extraction_method: string | null
  error: string | null
  meta: Record<string, unknown> | null
  created_at: number
  updated_at: number
  ocr_confidence: number | null
  hash: string | null
}> = []

async function sessionCookieHeader(token: string): Promise<string> {
  let session = await sessionStorage.read(null)
  session.set(ACCESS_TOKEN_KEY, token)
  let raw = await sessionStorage.save(session)
  assert.ok(raw)
  let setCookie = await sessionCookie.serialize(raw)
  return setCookie.split(';')[0]!
}

before(() => {
  fileStore = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let auth = new Headers(init?.headers).get('Authorization') ?? ''
    if (!auth.includes(MOCK_TOKEN) && url.includes('/api/files')) {
      return Response.json({ detail: 'Unauthorized' }, { status: 401 })
    }

    if (url.endsWith('/api/files') && method === 'POST') {
      let form = init?.body as FormData | undefined
      let uploaded = form?.get('file')
      let uploadName = uploaded instanceof File ? uploaded.name : 'notes.txt'
      if (uploadName === 'spoof.pdf') {
        return Response.json({ error: 'file_content_mismatch' }, { status: 400 })
      }
      let id = `file-${fileStore.length + 1}`
      let row = {
        id,
        filename: uploadName,
        status: 'pending',
        extraction_method: null,
        error: null,
        meta: null,
        created_at: 1,
        updated_at: 1,
        ocr_confidence: null,
        hash: null,
      }
      fileStore.unshift(row)
      return Response.json(row, { status: 201 })
    }

    let statusMatch = url.match(/\/api\/files\/([^/]+)\/status$/)
    if (statusMatch && method === 'GET') {
      let row = fileStore.find((f) => f.id === statusMatch[1])
      if (!row) return Response.json({ detail: 'Not found' }, { status: 404 })
      if (row.filename.endsWith('.png')) {
        row.status = 'failed'
        row.error = 'tesseract_not_found'
        row.meta = { error: 'tesseract_not_found' }
      } else if (row.status === 'pending') {
        row.status = 'ready'
        row.extraction_method = 'text_layer'
      }
      return Response.json({
        id: row.id,
        status: row.status,
        extraction_method: row.extraction_method,
        error: row.error,
      })
    }

    let contentMatch = url.match(/\/api\/files\/([^/]+)\/content$/)
    if (contentMatch && method === 'GET') {
      let row = fileStore.find((f) => f.id === contentMatch[1])
      if (!row) return Response.json({ detail: 'Not found' }, { status: 404 })
      return new Response('PNG-CONTENT', {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      })
    }

    let deleteMatch = url.match(/\/api\/files\/([^/]+)$/)
    if (deleteMatch && method === 'DELETE') {
      let idx = fileStore.findIndex((f) => f.id === deleteMatch[1])
      if (idx < 0) return Response.json({ detail: 'File not found' }, { status: 404 })
      fileStore.splice(idx, 1)
      return new Response(null, { status: 204 })
    }

    return new Response(`unexpected ${method} ${url}`, { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('files BFF (no library page)', () => {
  it('formatFileError maps tesseract_not_found to a human message', () => {
    assert.match(formatFileError('tesseract_not_found') ?? '', /Tesseract/i)
  })

  it('GET /files redirects to home (library removed)', async () => {
    let response = await router.fetch(new Request('http://localhost/files'))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), routes.home.href())
  })

  it('GET /files redirects authenticated users to home too', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/files', { headers: { Cookie: cookie } }),
    )
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), routes.home.href())
  })

  it('POST /files/upload forwards multipart and returns the new file JSON', async () => {
    fileStore = []
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let body = new FormData()
    body.append('file', new File(['hello corpus'], 'notes.txt', { type: 'text/plain' }))

    let response = await router.fetch(
      new Request('http://localhost/files/upload', {
        method: 'POST',
        headers: { Cookie: cookie, Accept: 'application/json' },
        body,
      }),
    )
    assert.equal(response.status, 201)
    let json = (await response.json()) as { file: { filename: string; status: string } }
    assert.equal(json.file.filename, 'notes.txt')
    assert.equal(json.file.status, 'pending')
    assert.equal(fileStore.length, 1)
  })

  it('POST /files/upload rejects a disallowed extension before FastAPI', async () => {
    fileStore = []
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let body = new FormData()
    body.append('file', new File(['MZ'], 'payload.exe', { type: 'application/octet-stream' }))

    let response = await router.fetch(
      new Request('http://localhost/files/upload', {
        method: 'POST',
        headers: { Cookie: cookie, Accept: 'application/json' },
        body,
      }),
    )
    assert.equal(response.status, 400)
    let json = (await response.json()) as { error: string }
    assert.match(json.error, /Unsupported type/)
    assert.equal(fileStore.length, 0)
  })

  it('POST /files/upload passes through FastAPI file_content_mismatch as 400', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let body = new FormData()
    body.append('file', new File(['not a pdf'], 'spoof.pdf', { type: 'application/pdf' }))

    let response = await router.fetch(
      new Request('http://localhost/files/upload', {
        method: 'POST',
        headers: { Cookie: cookie, Accept: 'application/json' },
        body,
      }),
    )
    assert.equal(response.status, 400)
    let json = (await response.json()) as { error: string }
    assert.equal(json.error, 'file_content_mismatch')
  })

  it('POST /files/upload accepts a 3 MiB file (was 500 under the 2 MiB parser default)', async () => {
    fileStore = []
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let body = new FormData()
    body.append(
      'file',
      new File([new Uint8Array(3 * 1024 * 1024)], 'corpus.txt', { type: 'text/plain' }),
    )

    let response = await router.fetch(
      new Request('http://localhost/files/upload', {
        method: 'POST',
        headers: { Cookie: cookie, Accept: 'application/json' },
        body,
      }),
    )
    assert.equal(response.status, 201)
    assert.equal(fileStore.length, 1)
  })

  it('POST /files/upload answers oversize multipart with 413 JSON, not a 500', async () => {
    fileStore = []
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let body = new FormData()
    body.append(
      'file',
      new File([new Uint8Array(26 * 1024 * 1024)], 'huge.txt', { type: 'text/plain' }),
    )

    let response = await router.fetch(
      new Request('http://localhost/files/upload', {
        method: 'POST',
        headers: { Cookie: cookie, Accept: 'application/json' },
        body,
      }),
    )
    assert.equal(response.status, 413)
    let json = (await response.json()) as { error: string }
    assert.match(json.error, /25 MiB/)
    assert.equal(fileStore.length, 0)
  })

  it('POST /files/upload rejects a zero-byte file locally as 400', async () => {
    fileStore = []
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let body = new FormData()
    body.append('file', new File([], 'empty.txt', { type: 'text/plain' }))

    let response = await router.fetch(
      new Request('http://localhost/files/upload', {
        method: 'POST',
        headers: { Cookie: cookie, Accept: 'application/json' },
        body,
      }),
    )
    assert.equal(response.status, 400)
    let json = (await response.json()) as { error: string }
    assert.match(json.error, /empty/i)
    assert.equal(fileStore.length, 0)
  })

  it('GET /files/:id/status returns OCR failure detail', async () => {
    fileStore = [
      {
        id: 'scan-1',
        filename: 'scan.png',
        status: 'pending',
        extraction_method: null,
        error: null,
        meta: null,
        created_at: 1,
        updated_at: 1,
        ocr_confidence: null,
        hash: null,
      },
    ]
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/files/scan-1/status', {
        headers: { Cookie: cookie, Accept: 'application/json' },
      }),
    )
    assert.equal(response.status, 200)
    let json = (await response.json()) as { status: string; error: string }
    assert.equal(json.status, 'failed')
    assert.equal(json.error, 'tesseract_not_found')
  })

  it('GET /files/:id/status returns 404 after FastAPI delete', async () => {
    fileStore = []
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/files/missing-1/status', {
        headers: { Cookie: cookie, Accept: 'application/json' },
      }),
    )
    assert.equal(response.status, 404)
  })

  it('DELETE /files/:id forwards to FastAPI and returns 204', async () => {
    fileStore = [
      {
        id: 'drop-1',
        filename: 'notes.txt',
        status: 'ready',
        extraction_method: 'text_layer',
        error: null,
        meta: null,
        created_at: 1,
        updated_at: 1,
        ocr_confidence: null,
        hash: null,
      },
    ]
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost' + routes.files.destroy.href({ fileId: 'drop-1' }), {
        method: 'DELETE',
        headers: { Cookie: cookie, Accept: 'application/json' },
      }),
    )
    assert.equal(response.status, 204)
    assert.equal(fileStore.length, 0)
  })

  it('GET /files/:id/content streams blob bytes with content-type and private cache headers', async () => {
    fileStore = [
      {
        id: 'blob-1',
        filename: 'receipt.png',
        status: 'ready',
        extraction_method: 'ocr:tesseract',
        error: null,
        meta: null,
        created_at: 1,
        updated_at: 1,
        ocr_confidence: 91.5,
        hash: null,
      },
    ]
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost' + routes.files.content.href({ fileId: 'blob-1' }), {
        headers: { Cookie: cookie, Accept: 'image/png' },
      }),
    )
    assert.equal(response.status, 200)
    assert.equal(await response.text(), 'PNG-CONTENT')
    assert.equal(response.headers.get('Content-Type'), 'image/png')
    assert.equal(response.headers.get('Cache-Control'), 'private, max-age=300')
  })

  it('GET /files/:id/content passes through 404 for unknown files', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost' + routes.files.content.href({ fileId: 'ghost-1' }), {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(response.status, 404)
  })

  it('GET /files/:id/content redirects anonymous users to login (303)', async () => {
    let response = await router.fetch(
      new Request('http://localhost' + routes.files.content.href({ fileId: 'blob-1' })),
    )
    assert.equal(response.status, 303)
    let location = response.headers.get('Location') ?? ''
    assert.ok(location.startsWith('/login'), `redirects to login, got: ${location}`)
  })
})

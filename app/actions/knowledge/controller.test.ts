/**
 * Knowledge BFF after management-UI removal: create + addFile kept; GET pages redirect home.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import {
  ACCESS_TOKEN_KEY,
  sessionCookie,
  sessionStorage,
} from '../../middleware/session.ts'

const MOCK_TOKEN = 'knowledge-step.jwt.token'

type FileRow = {
  id: string
  filename: string
  status: string
  extraction_method: string | null
  ocr_confidence: number | null
  hash: string | null
  meta: Record<string, unknown> | null
  created_at: number
  updated_at: number
}

type KbRow = {
  id: string
  name: string
  description: string | null
  meta: Record<string, unknown> | null
  created_at: number
  updated_at: number
  file_ids: string[]
}

let originalFetch = globalThis.fetch
let fileStore: FileRow[] = []
let kbStore: KbRow[] = []

async function sessionCookieHeader(token: string): Promise<string> {
  let session = await sessionStorage.read(null)
  session.set(ACCESS_TOKEN_KEY, token)
  let raw = await sessionStorage.save(session)
  assert.ok(raw)
  let setCookie = await sessionCookie.serialize(raw)
  return setCookie.split(';')[0]!
}

function kbResponse(row: KbRow) {
  let files = row.file_ids.map((fileId) => {
    let file = fileStore.find((f) => f.id === fileId)
    return {
      file_id: fileId,
      filename: file?.filename ?? 'missing.txt',
      status: file?.status ?? 'ready',
      extraction_method: file?.extraction_method ?? null,
      created_at: row.created_at,
    }
  })
  return {
    ...row,
    files,
  }
}

before(() => {
  fileStore = [
    {
      id: 'file-a',
      filename: 'notes.txt',
      status: 'ready',
      extraction_method: 'text_layer',
      ocr_confidence: null,
      hash: 'h1',
      meta: null,
      created_at: 1,
      updated_at: 1,
    },
    {
      id: 'file-b',
      filename: 'scan.png',
      status: 'ready',
      extraction_method: 'ocr',
      ocr_confidence: 0.9,
      hash: 'h2',
      meta: null,
      created_at: 2,
      updated_at: 2,
    },
  ]
  kbStore = []

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let auth = new Headers(init?.headers).get('Authorization') ?? ''
    if (
      !auth.includes(MOCK_TOKEN) &&
      (url.includes('/api/knowledge') || url.includes('/api/files'))
    ) {
      return Response.json({ detail: 'Unauthorized' }, { status: 401 })
    }

    if (url.endsWith('/api/knowledge') && method === 'POST') {
      let body = JSON.parse(String(init?.body ?? '{}')) as {
        name?: string
        description?: string | null
        meta?: Record<string, unknown> | null
      }
      let row: KbRow = {
        id: `kb-${kbStore.length + 1}`,
        name: body.name ?? 'Untitled',
        description: body.description ?? null,
        meta: body.meta ?? null,
        created_at: Date.now(),
        updated_at: Date.now(),
        file_ids: [],
      }
      kbStore.unshift(row)
      return Response.json(kbResponse(row), { status: 201 })
    }

    let addMatch = url.match(/\/api\/knowledge\/([^/]+)\/files$/)
    if (addMatch && method === 'POST') {
      let row = kbStore.find((k) => k.id === addMatch[1])
      if (!row) return Response.json({ detail: 'Not found' }, { status: 404 })
      let body = JSON.parse(String(init?.body ?? '{}')) as { file_id?: string }
      let fileId = body.file_id ?? ''
      if (!fileStore.some((f) => f.id === fileId)) {
        return Response.json({ detail: 'File not found' }, { status: 404 })
      }
      if (row.file_ids.includes(fileId)) {
        return Response.json({ detail: 'File already in knowledge base' }, { status: 409 })
      }
      row.file_ids.push(fileId)
      row.updated_at = Date.now()
      return Response.json(kbResponse(row))
    }

    return new Response(`unexpected ${method} ${url}`, { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('knowledge BFF (no management UI)', () => {
  it('GET /knowledge redirects to home', async () => {
    let response = await router.fetch(new Request('http://localhost/knowledge'))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), routes.home.href())
  })

  it('GET /knowledge/:id redirects to home', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/knowledge/kb-any', {
        headers: { Cookie: cookie },
      }),
    )
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), routes.home.href())
  })

  it('POST /knowledge/create with JSON returns the knowledge record', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    kbStore = []
    let response = await router.fetch(
      new Request('http://localhost/knowledge/create', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Chat — notes.pdf',
          meta: { is_auto_created: true },
        }),
      }),
    )
    assert.equal(response.status, 201)
    let payload = (await response.json()) as {
      knowledge: { name: string; meta: Record<string, unknown> | null }
    }
    assert.equal(payload.knowledge.name, 'Chat — notes.pdf')
    assert.equal(payload.knowledge.meta?.is_auto_created, true)
    assert.equal(kbStore[0]?.meta?.is_auto_created, true)
  })

  it('POST /knowledge/create rejects form posts (JSON-only for implicit attach)', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let body = new URLSearchParams({ name: 'Contracts', description: 'Legal PDFs' })
    let response = await router.fetch(
      new Request('http://localhost/knowledge/create', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      }),
    )
    assert.equal(response.status, 400)
    let payload = (await response.json()) as { error: string }
    assert.match(payload.error, /automatically/i)
  })

  it('POST addFile attaches a file to the knowledge base', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    kbStore = [
      {
        id: 'kb-add',
        name: 'Research',
        description: null,
        meta: null,
        created_at: 1,
        updated_at: 1,
        file_ids: [],
      },
    ]
    let response = await router.fetch(
      new Request('http://localhost/knowledge/kb-add/files', {
        method: 'POST',
        headers: {
          Cookie: cookie,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ file_id: 'file-b' }),
      }),
    )
    assert.equal(response.status, 200)
    let payload = (await response.json()) as {
      knowledge: { file_ids: string[] }
    }
    assert.deepEqual(payload.knowledge.file_ids, ['file-b'])
  })
})

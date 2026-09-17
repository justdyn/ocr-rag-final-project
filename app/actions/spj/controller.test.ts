/**
 * SPJ BFF (Phase B4): draft create/show/confirm proxies + gated export
 * passthrough. FastAPI is mocked; ownership/409 stay upstream.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { ACCESS_TOKEN_KEY, sessionCookie, sessionStorage } from '../../middleware/session.ts'

const MOCK_TOKEN = 'spj-b4.jwt.token'

type DraftRow = {
  id: string
  knowledge_id: string
  fields: unknown
  document_total_computed: number
  confirmed: boolean
}

let originalFetch = globalThis.fetch
let draftSeq = 0
let drafts = new Map<string, DraftRow>()

function draftBody(draft: DraftRow) {
  return {
    id: draft.id,
    knowledge_id: draft.knowledge_id,
    fields: draft.fields,
    document_total_computed: draft.document_total_computed,
    confirmed: draft.confirmed,
  }
}

async function sessionCookieHeader(token: string): Promise<string> {
  let session = await sessionStorage.read(null)
  session.set(ACCESS_TOKEN_KEY, token)
  let raw = await sessionStorage.save(session)
  assert.ok(raw)
  let setCookie = await sessionCookie.serialize(raw)
  return setCookie.split(';')[0]!
}

before(() => {
  draftSeq = 0
  drafts = new Map()
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let auth = new Headers(init?.headers).get('Authorization') ?? ''
    if (!auth.includes(MOCK_TOKEN) && url.includes('/api/')) {
      return Response.json({ detail: 'Unauthorized' }, { status: 401 })
    }

    let createMatch = url.match(/\/api\/knowledge\/([^/]+)\/spj\/draft$/)
    if (createMatch && method === 'POST') {
      let id = `draft-${++draftSeq}`
      let draft: DraftRow = {
        id,
        knowledge_id: decodeURIComponent(createMatch[1]!),
        fields: {
          vendor: 'PT X',
          date: '2026-01-05',
          currency: 'IDR',
          lines: [{ line_total: 10000 }, { line_total: 5000 }],
        },
        document_total_computed: 15000,
        confirmed: false,
      }
      drafts.set(id, draft)
      return Response.json(draftBody(draft))
    }

    let getMatch = url.match(/\/api\/spj\/drafts\/([^/]+)$/)
    if (getMatch && method === 'GET') {
      let draft = drafts.get(getMatch[1]!)
      if (!draft) return Response.json({ detail: 'Draft not found' }, { status: 404 })
      return Response.json(draftBody(draft))
    }

    let confirmMatch = url.match(/\/api\/spj\/drafts\/([^/]+)\/confirm$/)
    if (confirmMatch && method === 'POST') {
      let draft = drafts.get(confirmMatch[1]!)
      if (!draft) return Response.json({ detail: 'Draft not found' }, { status: 404 })
      draft.confirmed = true
      return Response.json(draftBody(draft))
    }

    let exportMatch = url.match(/\/api\/spj\/drafts\/([^/]+)\/export$/)
    if (exportMatch && method === 'GET') {
      let draft = drafts.get(exportMatch[1]!)
      if (!draft) return Response.json({ detail: 'Draft not found' }, { status: 404 })
      if (!draft.confirmed) return Response.json({ detail: 'Draft not confirmed' }, { status: 409 })
      return new Response('<html><body>Total: 15,000</body></html>', {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `attachment; filename="spj-${draft.id}.html"`,
        },
      })
    }

    return Response.json({ detail: 'Not Found' }, { status: 404 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('spj BFF proxy', () => {
  it('anonymous create redirects to login', async () => {
    let response = await router.fetch(
      new Request('http://localhost/spj/knowledge/k1/draft', { method: 'POST' }),
    )
    assert.equal(response.status, 303)
    assert.ok(response.headers.get('Location')?.includes('/login'))
  })

  it('authed create/show/confirm proxy upstream JSON', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let headers = { Cookie: cookie, Accept: 'application/json' }

    let res = await router.fetch(
      new Request('http://localhost/spj/knowledge/k1/draft', { method: 'POST', headers }),
    )
    assert.equal(res.status, 200)
    let created = (await res.json()) as {
      id: string
      knowledge_id: string
      confirmed: boolean
      document_total_computed: number
    }
    assert.equal(created.knowledge_id, 'k1')
    assert.equal(created.confirmed, false)
    assert.equal(created.document_total_computed, 15000)

    res = await router.fetch(new Request(`http://localhost/spj/drafts/${created.id}`, { headers }))
    assert.equal(res.status, 200)
    let shown = (await res.json()) as { id: string; confirmed: boolean }
    assert.equal(shown.id, created.id)

    res = await router.fetch(
      new Request(`http://localhost/spj/drafts/${created.id}/confirm`, { method: 'POST', headers }),
    )
    assert.equal(res.status, 200)
    let confirmed = (await res.json()) as { confirmed: boolean }
    assert.equal(confirmed.confirmed, true)
  })

  it('export is 409-gated until confirm, then passes HTML attachment through', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let headers = { Cookie: cookie, Accept: 'application/json' }

    let res = await router.fetch(
      new Request('http://localhost/spj/knowledge/k1/draft', { method: 'POST', headers }),
    )
    let created = (await res.json()) as { id: string }

    res = await router.fetch(new Request(`http://localhost/spj/drafts/${created.id}/export`, { headers }))
    assert.equal(res.status, 409)
    assert.equal(((await res.json()) as { detail: string }).detail, 'Draft not confirmed')

    res = await router.fetch(new Request(`http://localhost/spj/drafts/${created.id}/confirm`, { method: 'POST', headers }))
    assert.equal(res.status, 200)

    res = await router.fetch(new Request(`http://localhost/spj/drafts/${created.id}/export`, { headers }))
    assert.equal(res.status, 200)
    assert.ok(res.headers.get('Content-Type')?.startsWith('text/html'))
    assert.equal(
      res.headers.get('Content-Disposition'),
      `attachment; filename="spj-${created.id}.html"`,
    )
    assert.ok((await res.text()).includes('15,000'))
  })

  it('upstream 404 passes through as 404', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let res = await router.fetch(
      new Request('http://localhost/spj/drafts/missing', { headers: { Cookie: cookie } }),
    )
    assert.equal(res.status, 404)
  })

  it('anonymous GET review redirects to login', async () => {
    let response = await router.fetch(
      new Request('http://localhost/spj/drafts/draft-1/review', { method: 'GET' }),
    )
    assert.equal(response.status, 303)
    assert.ok(response.headers.get('Location')?.includes('/login'))
  })

  it('authed GET review renders HTML with panel marker', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let headers = { Cookie: cookie, Accept: 'text/html' }

    // Create a draft first
    let res = await router.fetch(
      new Request('http://localhost/spj/knowledge/k1/draft', { method: 'POST', headers }),
    )
    let created = (await res.json()) as { id: string }

    res = await router.fetch(new Request(`http://localhost/spj/drafts/${created.id}/review`, { headers }))
    assert.equal(res.status, 200)
    assert.ok(res.headers.get('Content-Type')?.includes('text/html'))
    let html = await res.text()
    assert.ok(html.includes('data-spj-review-panel'))
  })

  it('review draft 404 returns 404', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let headers = { Cookie: cookie, Accept: 'text/html' }

    let res = await router.fetch(new Request('http://localhost/spj/drafts/missing/review', { headers }))
    assert.equal(res.status, 404)
  })
})

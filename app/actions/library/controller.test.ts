/**
 * Library route — auth gate + shell HTML (list loaded server-side).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { ACCESS_TOKEN_KEY, sessionCookie, sessionStorage } from '../../middleware/session.ts'

const MOCK_TOKEN = 'library-step.jwt.token'

let originalFetch = globalThis.fetch

async function sessionCookieHeader(token: string): Promise<string> {
  let session = await sessionStorage.read(null)
  session.set(ACCESS_TOKEN_KEY, token)
  let raw = await sessionStorage.save(session)
  assert.ok(raw)
  let setCookie = await sessionCookie.serialize(raw)
  return setCookie.split(';')[0]!
}

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let auth = new Headers(init?.headers).get('Authorization') ?? ''

    if (url.includes('/api/auth/me')) {
      if (!auth.includes(MOCK_TOKEN)) {
        return Response.json({ detail: 'Unauthorized' }, { status: 401 })
      }
      return Response.json({
        id: 'user-1',
        name: 'Dev',
        email: 'dev@example.com',
      })
    }

    if (url.includes('/api/conversations/last')) {
      return Response.json(null)
    }

    if (url.includes('/api/knowledge/') && url.includes('/conversations')) {
      return Response.json([])
    }

    if (url.includes('/api/files') && method === 'GET' && !/\/api\/files\/[^/]+/.test(url.split('?')[0]!)) {
      if (!auth.includes(MOCK_TOKEN)) {
        return Response.json({ detail: 'Unauthorized' }, { status: 401 })
      }
      let items = [
        {
          id: 'file-1',
          filename: 'report.pdf',
          status: 'ready',
          extraction_method: 'text_layer',
          ocr_confidence: null,
          hash: null,
          meta: { content_type: 'application/pdf' },
          created_at: 10,
          updated_at: 20,
        },
      ]
      return Response.json({
        items,
        page: 1,
        limit: 10,
        total: items.length,
        has_more: false,
      })
    }

    return new Response(`unexpected ${method} ${url}`, { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('library BFF', () => {
  it('GET /library redirects anonymous users to login with returnTo', async () => {
    let response = await router.fetch(new Request('http://localhost/library'))
    assert.equal(response.status, 303)
    let location = response.headers.get('Location') ?? ''
    assert.ok(location.startsWith('/login'), `got ${location}`)
    assert.ok(location.includes('returnTo'), `expected returnTo in ${location}`)
  })

  it('GET /library returns HTML with Library chrome for authenticated users', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/library', { headers: { Cookie: cookie } }),
    )
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Library/)
    assert.match(html, /report\.pdf/)
    assert.match(html, /data-library-panel/)
  })
})

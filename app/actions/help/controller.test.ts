/**
 * Help route — auth gate + shell HTML (static FAQ).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { ACCESS_TOKEN_KEY, sessionCookie, sessionStorage } from '../../middleware/session.ts'

const MOCK_TOKEN = 'help-step.jwt.token'

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
        role: 'user',
      })
    }

    if (url.includes('/api/conversations/last')) {
      return Response.json({
        knowledge_id: 'kb-leak',
        knowledge_name: 'Chat — 2026-09-13 09:21',
        conversation_id: 'conv-1',
      })
    }

    if (url.includes('/api/knowledge/') && url.includes('/conversations')) {
      return Response.json([])
    }

    return new Response(`unexpected ${method} ${url}`, { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('help BFF', () => {
  it('GET /help redirects anonymous users to login with returnTo', async () => {
    let response = await router.fetch(new Request('http://localhost/help'))
    assert.equal(response.status, 303)
    let location = response.headers.get('Location') ?? ''
    assert.ok(location.startsWith('/login'), `got ${location}`)
    assert.ok(location.includes('returnTo'), `expected returnTo in ${location}`)
  })

  it('GET /help returns HTML with Help chrome for authenticated users', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/help', { headers: { Cookie: cookie } }),
    )
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Help/)
    assert.match(html, /Frequently Asked Questions/)
    assert.match(html, /How do I upload a document\?/)
    assert.match(html, /What file types are supported\?/)
    assert.doesNotMatch(html, /Chat — 2026-09-13 09:21/)
    assert.match(html, /aria-label="Page title"[^>]*>[\s\S]*?Help/)
  })
})
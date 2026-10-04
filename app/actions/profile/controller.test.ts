/**
 * Profile route — auth gate + shell HTML (name/password forms).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { ACCESS_TOKEN_KEY, sessionCookie, sessionStorage } from '../../middleware/session.ts'

const MOCK_TOKEN = 'profile-step.jwt.token'

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

    if (url.includes('/api/profile') && method === 'GET') {
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

    return new Response(`unexpected ${method} ${url}`, { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('profile BFF', () => {
  it('GET /profile redirects anonymous users to login with returnTo', async () => {
    let response = await router.fetch(new Request('http://localhost/profile'))
    assert.equal(response.status, 303)
    let location = response.headers.get('Location') ?? ''
    assert.ok(location.startsWith('/login'), `got ${location}`)
    assert.ok(location.includes('returnTo'), `expected returnTo in ${location}`)
  })

  it('GET /profile returns HTML with Profile chrome for authenticated users', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/profile', { headers: { Cookie: cookie } }),
    )
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Profile/)
    assert.match(html, /Dev/)
    assert.match(html, /dev@example\.com/)
    // View: Edit in header trailing → /profile/edit; no forms
    assert.match(html, /href="[^"]*\/profile\/edit[^"]*"[^>]*>[\s\S]*?Edit/)
    assert.doesNotMatch(html, /Display name/)
    assert.doesNotMatch(html, /Current password/)
    assert.doesNotMatch(html, /New password/)
    assert.doesNotMatch(html, /Chat — 2026-09-13 09:21/)
    assert.match(html, /aria-label="Page title"[^>]*>[\s\S]*?Profile/)
  })

  it('GET /profile/edit returns HTML with forms for authenticated users', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/profile/edit', { headers: { Cookie: cookie } }),
    )
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Profile/)
    assert.match(html, /Dev/)
    assert.match(html, /dev@example\.com/)
    // Edit page has name form (password moved to Settings modal); no header Edit
    assert.match(html, /Display name/)
    assert.doesNotMatch(html, /Current password/)
    assert.doesNotMatch(html, /New password/)
    assert.match(html, /Cancel/)
    assert.doesNotMatch(html, /href="[^"]*\/profile\/edit[^"]*"[^>]*>[\s\S]*?Edit/)
    assert.match(html, /aria-label="Page title"[^>]*>[\s\S]*?Profile/)
  })

  it('POST /profile with invalid name re-renders edit page with error', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/profile', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'name=',
      }),
    )
    assert.equal(response.status, 400)
    let html = await response.text()
    assert.match(html, /Profile/)
    assert.match(html, /Edit/)
    assert.match(html, /Display name/)
    assert.match(html, /Name must be 1-255 characters/)
  })

  it('POST /profile/password with invalid password returns JSON 400 (legacy, no UI)', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let response = await router.fetch(
      new Request('http://localhost/profile/password', {
        method: 'POST',
        headers: { Cookie: cookie, 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'current_password=abc&new_password=short',
      }),
    )
    assert.equal(response.status, 400)
    let body = (await response.json()) as { error: string }
    assert.match(body.error, /Current password and new password/)
  })
})
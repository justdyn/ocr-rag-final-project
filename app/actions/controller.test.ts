/**
 * Collapsed SSR (isOpen=false) must emit the same host tags the desktop client
 * hydrates when it opens the sidebar. Missing tags here become
 * `Hydration mismatch: tag button a` / `tag button div` on first paint.
 *
 * Anonymous `GET /` now redirects to /login, so the chrome is asserted through a
 * real login (mock backend) — no injected session cookie.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../router.ts'
import { routes } from '../routes.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'

const MOCK_TOKEN = 'mock.jwt.token.for.tests'
const MOCK_USER = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'user',
}

let originalFetch = globalThis.fetch

function setCookieFromResponse(response: Response): string {
  let headers = response.headers as Headers & { getSetCookie?: () => string[] }
  let parts = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  if (parts.length === 0) {
    let single = response.headers.get('set-cookie')
    if (single) parts = [single]
  }
  assert.ok(parts.length > 0, 'expected Set-Cookie on login success')
  return parts
    .map((part) => part.split(';')[0]!)
    .filter(Boolean)
    .join('; ')
}

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : {}

    if (url.endsWith('/api/auth/login') && method === 'POST') {
      return Response.json({
        access_token: MOCK_TOKEN,
        token_type: 'bearer',
        user: { ...MOCK_USER, email: body.email },
      })
    }

    if (url.endsWith('/api/auth/me') && method === 'GET') {
      return Response.json({ ...MOCK_USER }, { status: 200 })
    }

    throw new Error(`Unexpected backend call in test: ${method} ${url}`)
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('authenticated home sidebar SSR chrome', () => {
  it('emits Home <a> + toggle <button> and the CTA <div> while collapsed', async () => {
    let login = await router.fetch(
      new Request('http://localhost' + routes.login.action.href(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: MOCK_USER.email,
          password: 'password123',
        }),
      }),
    )
    assert.equal(login.status, 303)
    let cookie = setCookieFromResponse(login)

    let response = await router.fetch(
      new Request('http://localhost' + routes.home.href(), { headers: { cookie } }),
    )
    assert.equal(response.status, 200)
    let html = await response.text()

    let asideStart = html.indexOf('aria-label="Chat navigation"')
    assert.ok(asideStart >= 0, 'expected chat sidebar aside')
    let asideEnd = html.indexOf('</aside>', asideStart)
    let aside = html.slice(asideStart, asideEnd)

    assert.match(aside, /<a[^>]*aria-label="Home"/)
    assert.match(aside, /<button[^>]*aria-label="Open sidebar"/)
    assert.ok(
      aside.indexOf('aria-label="Home"') < aside.indexOf('aria-label="Open sidebar"'),
      'Home link must precede the toggle so hydration matches [a, button]',
    )
    assert.ok(
      aside.includes(SHELL_COPY.ctaTitle),
      'CTA root must stay in collapsed SSR (otherwise open-state <div> hydrates onto a leftover <button>)',
    )
  })
})

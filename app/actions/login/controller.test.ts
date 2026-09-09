/**
 * Phase 7 Step 1 verification: session cookie + login/register/logout route behavior.
 * Uses a mock backend via global fetch override — does not require a live FastAPI process.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { nextSlideIndex } from './slide-show.tsx'
import { requireAuth } from '../../middleware/require-auth.ts'
import { ACCESS_TOKEN_KEY, sessionCookie, sessionStorage } from '../../middleware/session.ts'
import { router } from '../../router.ts'
import { routes } from '../../routes.ts'
import { loginHref } from '../../utils/login-href.ts'

const MOCK_TOKEN = 'mock.jwt.token.for.tests'
const MOCK_USER = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'user',
}

let originalFetch = globalThis.fetch

function setCookieFromResponse(response: Response): string {
  // Node may expose getSetCookie(); fall back to raw header.
  let headers = response.headers as Headers & { getSetCookie?: () => string[] }
  let parts = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : []
  if (parts.length === 0) {
    let single = response.headers.get('set-cookie')
    if (single) parts = [single]
  }
  assert.ok(parts.length > 0, 'expected Set-Cookie on auth success')
  // Cookie request header is name=value pairs; strip attributes.
  return parts
    .map((part) => part.split(';')[0]!)
    .filter(Boolean)
    .join('; ')
}

async function readTokenFromCookieHeader(cookieHeader: string): Promise<string | null> {
  let raw = await sessionCookie.parse(cookieHeader)
  let session = await sessionStorage.read(raw)
  let value = session.get(ACCESS_TOKEN_KEY)
  return typeof value === 'string' ? value : null
}

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, string>) : {}

    if (url.endsWith('/api/auth/register') && method === 'POST') {
      if (body.email === 'taken@example.com') {
        return Response.json({ detail: 'Email already registered' }, { status: 409 })
      }
      return Response.json(
        { id: 'user-1', email: body.email, name: body.name, role: 'user' },
        { status: 201 },
      )
    }

    if (url.endsWith('/api/auth/login') && method === 'POST') {
      if (body.password === 'wrong-password') {
        return Response.json({ detail: 'Invalid credentials' }, { status: 401 })
      }
      return Response.json({
        access_token: MOCK_TOKEN,
        token_type: 'bearer',
        user: { ...MOCK_USER, email: body.email },
      })
    }

    if (url.endsWith('/api/auth/logout') && method === 'POST') {
      return new Response(null, { status: 204 })
    }

    if (url.endsWith('/api/auth/me') && method === 'GET') {
      return Response.json({ ...MOCK_USER }, { status: 200 })
    }

    return new Response('unexpected fetch in test', { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('Phase 7 Step 1 auth BFF', () => {
  it('GET /login returns the sign-in form without a JWT in the HTML', async () => {
    let response = await router.fetch(new Request('http://localhost/login'))
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Sign in/)
    assert.match(html, /Get started/)
    assert.match(html, /data-show="false"/)
    assert.match(html, /\[data-show="false"\]/)
    assert.doesNotMatch(html, /access_token/)
    assert.doesNotMatch(html, /mock\.jwt/)
  })

  it('GET /login?welcome=1 shows the onboarding splash over the form', async () => {
    let response = await router.fetch(new Request('http://localhost/login?welcome=1'))
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /Sign in/)
    assert.match(html, /data-show="true"/)
  })

  it('GET /register Sign in links to /login without the splash query', async () => {
    let response = await router.fetch(new Request('http://localhost/register'))
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /href="\/login"/)
    assert.doesNotMatch(html, /href="\/login\?welcome/)
    assert.match(html, /Sign in/)
  })

  it('GET / redirects anonymous users to the login splash', async () => {
    let response = await router.fetch(new Request('http://localhost/'))
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), loginHref({ welcome: true }))
  })

  it('GET / serves the chat shell for an authenticated session', async () => {
    let login = await router.fetch(
      new Request('http://localhost/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: 'ada@example.com',
          password: 'password123',
        }),
      }),
    )
    let cookieHeader = setCookieFromResponse(login)

    let response = await router.fetch(
      new Request('http://localhost/', { headers: { Cookie: cookieHeader } }),
    )
    assert.equal(response.status, 200)
  })

  it('POST /login sets an httpOnly session cookie and never embeds the JWT in HTML', async () => {
    let body = new URLSearchParams({
      email: 'ada@example.com',
      password: 'password123',
    })
    let response = await router.fetch(
      new Request('http://localhost/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
    )
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), routes.home.href())

    let setCookie = response.headers.get('set-cookie') ?? ''
    assert.match(setCookie, /__session=/)
    assert.match(setCookie, /HttpOnly/i)
    assert.doesNotMatch(setCookie, new RegExp(MOCK_TOKEN.replace(/\./g, '\\.')))

    let cookieHeader = setCookieFromResponse(response)
    let token = await readTokenFromCookieHeader(cookieHeader)
    assert.equal(token, MOCK_TOKEN)

    // requireAuth reads the token from the cookie for later protected routes
    let auth = await requireAuth(
      new Request('http://localhost/protected', { headers: { Cookie: cookieHeader } }),
    )
    assert.equal(auth, MOCK_TOKEN)
  })

  it('POST /login with bad credentials re-renders without setting a session token', async () => {
    let body = new URLSearchParams({
      email: 'ada@example.com',
      password: 'wrong-password',
    })
    let response = await router.fetch(
      new Request('http://localhost/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
    )
    assert.equal(response.status, 401)
    let html = await response.text()
    assert.match(html, /Invalid email or password/)
    assert.equal(response.headers.get('set-cookie'), null)
  })

  it('POST /register creates the user, logs in, and stores JWT in the cookie only', async () => {
    let body = new URLSearchParams({
      name: 'Ada',
      email: 'new@example.com',
      password: 'password123',
    })
    let response = await router.fetch(
      new Request('http://localhost/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      }),
    )
    assert.equal(response.status, 303)
    assert.equal(response.headers.get('Location'), routes.home.href())

    let cookieHeader = setCookieFromResponse(response)
    let token = await readTokenFromCookieHeader(cookieHeader)
    assert.equal(token, MOCK_TOKEN)

    let htmlProbe = await response.clone().text().catch(() => '')
    assert.doesNotMatch(htmlProbe, /mock\.jwt/)
  })

  it('POST /logout clears the session cookie', async () => {
    // First login
    let login = await router.fetch(
      new Request('http://localhost/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          email: 'ada@example.com',
          password: 'password123',
        }),
      }),
    )
    let cookieHeader = setCookieFromResponse(login)

    let logout = await router.fetch(
      new Request('http://localhost/logout', {
        method: 'POST',
        headers: { Cookie: cookieHeader },
      }),
    )
    assert.equal(logout.status, 303)
    assert.equal(logout.headers.get('Location'), loginHref())

    let afterCookie = setCookieFromResponse(logout)
    let token = await readTokenFromCookieHeader(afterCookie)
    assert.equal(token, null)

    let auth = await requireAuth(
      new Request('http://localhost/protected', { headers: { Cookie: afterCookie } }),
    )
    assert.ok(auth instanceof Response)
    assert.equal(auth.status, 303)
    assert.match(auth.headers.get('Location') ?? '', /\/login/)
  })

  it('requireAuth redirects anonymous requests to /login', async () => {
    let auth = await requireAuth(new Request('http://localhost/files'))
    assert.ok(auth instanceof Response)
    assert.equal(auth.status, 303)
    assert.equal(
      auth.headers.get('Location'),
      loginHref({ returnTo: '/files' }),
    )
  })
})

describe('slideshow index wrap', () => {
  it('cycles every image with no off-by-one', () => {
    // Literal expected values, not recomputed — guards the OWUI `% (length - 1)` bug.
    assert.equal(nextSlideIndex(0, 4), 1)
    assert.equal(nextSlideIndex(1, 4), 2)
    assert.equal(nextSlideIndex(2, 4), 3)
    assert.equal(nextSlideIndex(3, 4), 0)
  })
})

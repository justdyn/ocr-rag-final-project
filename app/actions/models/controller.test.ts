/**
 * Models list BFF proxy — auth gate + query passthrough.
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

const MOCK_TOKEN = 'models.jwt.token'

let lastUpstreamUrl = ''

async function sessionCookieHeader(token: string): Promise<string> {
  let session = await sessionStorage.read(null)
  session.set(ACCESS_TOKEN_KEY, token)
  let raw = await sessionStorage.save(session)
  assert.ok(raw)
  let setCookie = await sessionCookie.serialize(raw)
  return setCookie.split(';')[0]!
}

let originalFetch = globalThis.fetch

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let auth = new Headers(init?.headers).get('Authorization') ?? ''
    if (!auth.includes(MOCK_TOKEN)) {
      return Response.json({ detail: 'Unauthorized' }, { status: 401 })
    }
    if (url.includes('/api/models') && method === 'GET') {
      lastUpstreamUrl = url
      return Response.json({
        items: [{ id: 'gpt-4o-mini', name: 'GPT-4o mini' }],
        next_offset: null,
        has_more: false,
        default_model: 'gpt-4o-mini',
      })
    }
    return new Response('not mocked', { status: 404 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('models list proxy', () => {
  it('redirects unauthenticated GETs to login', async () => {
    let response = await router.fetch(
      new Request(`http://localhost${routes.models.list.href()}`),
    )
    assert.equal(response.status, 303)
    assert.match(response.headers.get('Location') ?? '', /\/login/)
  })

  it('forwards q/offset/limit to the backend', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let href = `${routes.models.list.href()}?q=gpt&offset=10&limit=25`
    let response = await router.fetch(
      new Request(`http://localhost${href}`, {
        headers: { Cookie: cookie, Accept: 'application/json' },
      }),
    )
    assert.equal(response.status, 200)
    assert.match(lastUpstreamUrl, /[?&]q=gpt/)
    assert.match(lastUpstreamUrl, /[?&]offset=10/)
    assert.match(lastUpstreamUrl, /[?&]limit=25/)
    let body = (await response.json()) as { default_model?: string }
    assert.equal(body.default_model, 'gpt-4o-mini')
  })
})

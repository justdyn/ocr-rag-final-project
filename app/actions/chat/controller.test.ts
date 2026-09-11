/**
 * Path chat identity: /chat/:id hydrates; legacy ?conversation= redirects.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../router.ts'
import { routes } from '../../routes.ts'

const MOCK_TOKEN = 'mock.jwt.token.for.chat.path'
const MOCK_USER = {
  id: 'user-1',
  email: 'ada@example.com',
  name: 'Ada',
  role: 'user',
}
const CONV = {
  id: '6aa355a0-8fc4-83ec-828c-c2faebcf9556',
  title: 'Research on RAG',
  knowledge_id: 'kb-1',
  created_at: 1,
  updated_at: 2,
}
const KB = {
  id: 'kb-1',
  name: 'Thesis Docs',
  description: null,
  meta: null,
  created_at: 1,
  updated_at: 1,
  file_ids: [] as string[],
  files: [] as unknown[],
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

    if (url.endsWith('/api/conversations/last') && method === 'GET') {
      return Response.json({
        knowledge_id: KB.id,
        knowledge_name: KB.name,
      })
    }

    if (url.endsWith(`/api/conversations/${CONV.id}`) && method === 'GET' && !url.includes('/messages')) {
      return Response.json(CONV)
    }

    if (url.match(/\/api\/conversations\/[^/]+$/) && method === 'GET') {
      return Response.json({ detail: 'Conversation not found' }, { status: 404 })
    }

    if (url.endsWith(`/api/conversations/${CONV.id}/messages`) && method === 'GET') {
      return Response.json([
        {
          id: 'msg-1',
          conversation_id: CONV.id,
          role: 'user',
          content: 'hello',
          sources: null,
          created_at: 1,
        },
      ])
    }

    if (url.endsWith(`/api/knowledge/${KB.id}`) && method === 'GET') {
      return Response.json(KB)
    }

    if (url.endsWith(`/api/knowledge/${KB.id}/conversations`) && method === 'GET') {
      return Response.json([
        {
          id: CONV.id,
          title: CONV.title,
          created_at: CONV.created_at,
          updated_at: CONV.updated_at,
        },
      ])
    }

    throw new Error(`Unexpected backend call in test: ${method} ${url}`)
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

async function loginCookie(): Promise<string> {
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
  return setCookieFromResponse(login)
}

describe('GET /chat/:conversationId', () => {
  it('renders the shell for an owned conversation', async () => {
    let cookie = await loginCookie()
    let response = await router.fetch(
      new Request(
        'http://localhost' + routes.chat.show.href({ conversationId: CONV.id }),
        { headers: { cookie } },
      ),
    )
    assert.equal(response.status, 200)
    let html = await response.text()
    assert.match(html, /hello/)
  })

  it('returns 404 when the conversation is missing', async () => {
    let cookie = await loginCookie()
    let response = await router.fetch(
      new Request(
        'http://localhost' +
          routes.chat.show.href({ conversationId: 'missing-id' }),
        { headers: { cookie } },
      ),
    )
    assert.equal(response.status, 404)
  })

  it('redirects anonymous users to login', async () => {
    let response = await router.fetch(
      new Request(
        'http://localhost' + routes.chat.show.href({ conversationId: CONV.id }),
      ),
    )
    assert.equal(response.status, 303)
    let location = response.headers.get('Location') ?? ''
    assert.ok(location.includes(routes.login.index.href()))
  })
})

describe('legacy ?conversation= on home', () => {
  it('redirects to /chat/:id', async () => {
    let cookie = await loginCookie()
    let response = await router.fetch(
      new Request(
        `http://localhost${routes.home.href()}?conversation=${CONV.id}`,
        { headers: { cookie } },
      ),
    )
    assert.equal(response.status, 303)
    assert.equal(
      response.headers.get('Location'),
      routes.chat.show.href({ conversationId: CONV.id }),
    )
  })
})

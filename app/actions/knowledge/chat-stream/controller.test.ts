/**
 * Phase 7 Step 4: knowledge chat SSE proxy (mocked FastAPI stream + 503 path).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { router } from '../../../router.ts'
import { routes } from '../../../routes.ts'
import {
  ACCESS_TOKEN_KEY,
  sessionCookie,
  sessionStorage,
} from '../../../middleware/session.ts'

const MOCK_TOKEN = 'chat-step.jwt.token'

type ChatUpstreamBody = {
  query?: string
  stream?: boolean
  scope_id?: string
  attachment_file_ids?: string[]
}

let originalFetch = globalThis.fetch
/** Mutable capture — object property so TS CFA does not freeze it to `null`. */
let chatUpstream = {
  body: null as ChatUpstreamBody | null,
  attachmentFileIds: undefined as string[] | undefined,
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
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    let auth = new Headers(init?.headers).get('Authorization') ?? ''

    if (!auth.includes(MOCK_TOKEN)) {
      return Response.json({ detail: 'Unauthorized' }, { status: 401 })
    }

    if (url.includes('/api/chat/completions') && method === 'POST') {
      let body = JSON.parse(String(init?.body ?? '{}')) as ChatUpstreamBody
      chatUpstream.body = body
      chatUpstream.attachmentFileIds = body.attachment_file_ids
      if (body.query === 'trigger-503') {
        return Response.json(
          { detail: 'LLM_API_KEY is not set.' },
          { status: 503 },
        )
      }
      if (body.query === 'trigger-502') {
        return Response.json(
          { detail: 'Upstream model timed out.' },
          { status: 502 },
        )
      }

      let sse =
        'event: sources\ndata: {"sources":[{"id":1,"chunk_id":"c1","file_id":"f1","text":"chunk","rrf_score":0.5,"rerank_score":0.9,"extraction_method":"text_layer","rank":1}]}\n\n' +
        'event: token\ndata: {"delta":"Hello "}\n\n' +
        'event: token\ndata: {"delta":"[1]"}\n\n' +
        'event: done\ndata: {"conversation_id":"conv-1","message_id":"msg-1","incomplete":false}\n\n'

      return new Response(sse, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      })
    }

    return new Response('not mocked', { status: 404 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('knowledge chatStream proxy', () => {
  it('redirects unauthenticated POSTs to login', async () => {
    let href = routes.knowledge.chatStream.completions.href({
      knowledgeId: 'kb-1',
    })
    let response = await router.fetch(
      new Request(`http://localhost${href}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: 'hello' }),
      }),
    )
    assert.equal(response.status, 303)
    assert.match(response.headers.get('Location') ?? '', /\/login/)
  })

  it('rejects empty query with 400', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let href = routes.knowledge.chatStream.completions.href({
      knowledgeId: 'kb-1',
    })
    let response = await router.fetch(
      new Request(`http://localhost${href}`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query: '   ' }),
      }),
    )
    assert.equal(response.status, 400)
  })

  it('forwards 503 llm_not_configured from the backend', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let href = routes.knowledge.chatStream.completions.href({
      knowledgeId: 'kb-1',
    })
    let response = await router.fetch(
      new Request(`http://localhost${href}`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ query: 'trigger-503' }),
      }),
    )
    assert.equal(response.status, 503)
    let payload = (await response.json()) as { detail: string }
    assert.match(payload.detail, /LLM_API_KEY/i)
  })

  it('forwards 502 llm_upstream from the backend', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let href = routes.knowledge.chatStream.completions.href({
      knowledgeId: 'kb-1',
    })
    let response = await router.fetch(
      new Request(`http://localhost${href}`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query: 'trigger-502' }),
      }),
    )
    assert.equal(response.status, 502)
  })

  it('re-streams SSE text/event-stream from the backend', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let href = routes.knowledge.chatStream.completions.href({
      knowledgeId: 'kb-1',
    })
    let response = await router.fetch(
      new Request(`http://localhost${href}`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({ query: 'What is in the docs?' }),
      }),
    )
    assert.equal(response.status, 200)
    assert.match(response.headers.get('Content-Type') ?? '', /text\/event-stream/)
    let body = await response.text()
    assert.match(body, /event: sources/)
    assert.match(body, /event: token/)
    assert.match(body, /event: done/)
    assert.match(body, /conv-1/)
  })

  it('forwards attachment_file_ids to the backend chat completions body', async () => {
    let cookie = await sessionCookieHeader(MOCK_TOKEN)
    let href = routes.knowledge.chatStream.completions.href({
      knowledgeId: 'kb-1',
    })
    chatUpstream.attachmentFileIds = undefined
    let response = await router.fetch(
      new Request(`http://localhost${href}`, {
        method: 'POST',
        headers: {
          Cookie: cookie,
          'Content-Type': 'application/json',
          Accept: 'text/event-stream',
        },
        body: JSON.stringify({
          query: 'Summarize with files',
          attachment_file_ids: ['file-a', '  ', 'file-b', 99, 'file-a'],
        }),
      }),
    )
    assert.equal(response.status, 200)
    // Empty strings / non-strings dropped; duplicates kept in order (backend dedupes).
    assert.deepEqual(chatUpstream.attachmentFileIds, ['file-a', 'file-b', 'file-a'])
  })
})

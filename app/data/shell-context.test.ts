/**
 * Shell loader must never auto-pick a leftover/legacy knowledge base as chat scope.
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'

import { loadChatShellServerContext } from './shell-context.ts'

const TOKEN = 'shell-scope.jwt.token'
const LEGACY_KB = {
  id: 'kb-legacy',
  name: 'OCR Verification Set',
  description: null,
  meta: null,
  created_at: 1,
  updated_at: 1,
  file_ids: [] as string[],
  files: [] as unknown[],
}
const LEGACY_CONVERSATION = {
  id: 'conv-legacy',
  title: 'could you please the content from 4.jpg ?',
  created_at: 2,
  updated_at: 2,
}

let originalFetch = globalThis.fetch
let requested: string[] = []

before(() => {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    let url = String(input)
    let method = (init?.method ?? 'GET').toUpperCase()
    requested.push(`${method} ${url}`)

    if (url.endsWith('/api/auth/me') && method === 'GET') {
      return Response.json({
        id: 'user-1',
        email: 'oh@example.com',
        name: 'Oh Hyundo',
        role: 'user',
      })
    }

    if (url.endsWith('/api/knowledge') && method === 'GET') {
      return Response.json([
        {
          id: LEGACY_KB.id,
          name: LEGACY_KB.name,
          description: null,
          created_at: 1,
          updated_at: 1,
          file_count: 0,
        },
      ])
    }

    let kbMatch = url.match(/\/api\/knowledge\/([^/?]+)$/)
    if (kbMatch && method === 'GET' && !url.includes('/conversations')) {
      if (kbMatch[1] === LEGACY_KB.id) return Response.json(LEGACY_KB)
      return Response.json({ detail: 'Knowledge base not found' }, { status: 404 })
    }

    if (
      url.endsWith(`/api/knowledge/${LEGACY_KB.id}/conversations`) &&
      method === 'GET'
    ) {
      return Response.json([LEGACY_CONVERSATION])
    }

    if (
      url.endsWith(`/api/conversations/${LEGACY_CONVERSATION.id}/messages`) &&
      method === 'GET'
    ) {
      return Response.json([
        {
          id: 'msg-1',
          conversation_id: LEGACY_CONVERSATION.id,
          role: 'user',
          content: 'hello',
          sources: null,
          created_at: 2,
        },
      ])
    }

    return new Response(`unexpected ${method} ${url}`, { status: 500 })
  }) as typeof fetch
})

after(() => {
  globalThis.fetch = originalFetch
})

describe('loadChatShellServerContext', () => {
  it('does not auto-pick a legacy knowledge base when no ?knowledge= is set', async () => {
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, { hydrateChat: true })

    assert.equal(shell.activeKnowledgeId, null)
    assert.equal(shell.activeKnowledgeName, null)
    assert.equal(shell.chatKnowledgeId, null)
    assert.equal(shell.chatKnowledgeName, null)
    assert.deepEqual(shell.conversations, [])
    assert.equal(shell.activeConversationId, null)
    assert.deepEqual(shell.initialMessages, [])
    assert.equal(shell.userName, 'Oh Hyundo')
    assert.equal(shell.userEmail, 'oh@example.com')
    assert.equal(
      requested.some((row) => row.includes('/conversations')),
      false,
      'must not load conversations for an unselected leftover KB',
    )
  })

  it('scopes sidebar and composer to the URL knowledge id only', async () => {
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, {
      preferredKnowledgeId: LEGACY_KB.id,
      preferredConversationId: LEGACY_CONVERSATION.id,
      hydrateChat: true,
    })

    assert.equal(shell.activeKnowledgeId, LEGACY_KB.id)
    assert.equal(shell.activeKnowledgeName, LEGACY_KB.name)
    assert.equal(shell.chatKnowledgeId, LEGACY_KB.id)
    assert.equal(shell.chatKnowledgeName, LEGACY_KB.name)
    assert.equal(shell.conversations[0]?.id, LEGACY_CONVERSATION.id)
    assert.equal(shell.activeConversationId, LEGACY_CONVERSATION.id)
    assert.equal(shell.initialMessages.length, 1)
  })

  it('ignores a preferred id that does not resolve to an owned knowledge base', async () => {
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, {
      preferredKnowledgeId: 'kb-missing',
      hydrateChat: true,
    })

    assert.equal(shell.activeKnowledgeId, null)
    assert.equal(shell.chatKnowledgeId, null)
    assert.deepEqual(shell.conversations, [])
  })
})

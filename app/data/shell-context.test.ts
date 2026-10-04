/**
 * Shell scope contract:
 * - Composer scope (`chatKnowledgeId`) from opened conversation's knowledge_id.
 * - Sidebar scope (`activeKnowledgeId`) hydrates from the user's last active
 *   knowledge when no conversation/preferred KB is set, so the recent-chats
 *   list survives a full remount (re-login / restart).
 * - Never picks "first knowledge base" from the KB listing.
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
  knowledge_id: LEGACY_KB.id,
  created_at: 2,
  updated_at: 2,
}

/** What `GET /api/conversations/last` returns for the current test. */
let lastScope: 'kb' | 'none' = 'kb'

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

    if (url.endsWith('/api/conversations/last') && method === 'GET') {
      if (lastScope === 'none') return Response.json(null)
      return Response.json({
        knowledge_id: LEGACY_KB.id,
        knowledge_name: LEGACY_KB.name,
      })
    }

    if (
      url.endsWith(`/api/conversations/${LEGACY_CONVERSATION.id}`) &&
      method === 'GET' &&
      !url.includes('/messages')
    ) {
      return Response.json(LEGACY_CONVERSATION)
    }

    if (url.match(/\/api\/conversations\/[^/]+$/) && method === 'GET') {
      return Response.json({ detail: 'Conversation not found' }, { status: 404 })
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
      return Response.json([
        {
          id: LEGACY_CONVERSATION.id,
          title: LEGACY_CONVERSATION.title,
          created_at: LEGACY_CONVERSATION.created_at,
          updated_at: LEGACY_CONVERSATION.updated_at,
        },
      ])
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
  it('hydrates the sidebar from the last active knowledge when no conversation is open', async () => {
    lastScope = 'kb'
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, { hydrateChat: true })

    assert.equal(shell.activeKnowledgeId, LEGACY_KB.id)
    assert.equal(shell.activeKnowledgeName, LEGACY_KB.name)
    assert.equal(shell.conversations[0]?.id, LEGACY_CONVERSATION.id)

    assert.equal(shell.chatKnowledgeId, null)
    assert.equal(shell.chatKnowledgeName, null)
    assert.deepEqual(shell.knowledgeBases, [])
    assert.equal(shell.activeConversationId, null)
    assert.deepEqual(shell.initialMessages, [])
    assert.equal(shell.conversationNotFound, false)
    assert.equal(shell.userName, 'Oh Hyundo')
    assert.equal(shell.userEmail, 'oh@example.com')
    assert.equal(shell.userRole, 'user')
    assert.equal(
      requested.some((row) => row.endsWith('/api/knowledge')),
      false,
      'must never pick from the knowledge-base listing',
    )
    assert.equal(
      requested.some((row) => row.endsWith(`/api/knowledge/${LEGACY_KB.id}`)),
      false,
      'last-active scope needs no extra KB fetch',
    )
  })

  it('stays empty when no last conversation exists', async () => {
    lastScope = 'none'
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, { hydrateChat: true })

    assert.equal(shell.activeKnowledgeId, null)
    assert.equal(shell.activeKnowledgeName, null)
    assert.equal(shell.chatKnowledgeId, null)
    assert.equal(shell.chatKnowledgeName, null)
    assert.deepEqual(shell.conversations, [])
    assert.equal(shell.activeConversationId, null)
    assert.deepEqual(shell.initialMessages, [])
    assert.equal(shell.conversationNotFound, false)
    assert.equal(shell.userRole, 'user')
    assert.equal(
      requested.some((row) => row.includes('/api/knowledge/')),
      false,
      'must not load conversations for an unselected KB',
    )
  })

  it('hydrates composer and messages from conversation id alone', async () => {
    lastScope = 'kb'
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, {
      preferredConversationId: LEGACY_CONVERSATION.id,
      hydrateChat: true,
    })

    assert.equal(shell.chatKnowledgeId, LEGACY_KB.id)
    assert.equal(shell.chatKnowledgeName, LEGACY_KB.name)
    assert.equal(shell.activeKnowledgeId, LEGACY_KB.id)
    assert.equal(shell.activeConversationId, LEGACY_CONVERSATION.id)
    assert.equal(shell.initialMessages.length, 1)
    assert.equal(shell.conversationNotFound, false)
    assert.equal(shell.userRole, 'user')
    assert.equal(
      requested.some((row) =>
        row.endsWith(`/api/conversations/${LEGACY_CONVERSATION.id}`),
      ),
      true,
      'must resolve conversation metadata by id',
    )
    assert.equal(
      requested.some((row) => row.includes('/api/conversations/last')),
      false,
      'opened conversation needs no last-active lookup',
    )
  })

  it('flags conversationNotFound when the id is missing or not owned', async () => {
    lastScope = 'kb'
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, {
      preferredConversationId: 'conv-missing',
      hydrateChat: true,
    })

    assert.equal(shell.conversationNotFound, true)
    assert.equal(shell.activeConversationId, null)
    assert.deepEqual(shell.initialMessages, [])
    assert.equal(shell.chatKnowledgeId, null)
    assert.equal(shell.userRole, 'user')
  })

  it('ignores a preferred knowledge id that does not resolve', async () => {
    lastScope = 'kb'
    requested = []
    let shell = await loadChatShellServerContext(TOKEN, {
      preferredKnowledgeId: 'kb-missing',
      hydrateChat: true,
    })

    assert.equal(shell.activeKnowledgeId, null)
    assert.equal(shell.chatKnowledgeId, null)
    assert.deepEqual(shell.conversations, [])
    assert.equal(shell.conversationNotFound, false)
    assert.equal(shell.userRole, 'user')
    assert.equal(
      requested.some((row) => row.includes('/api/conversations/last')),
      false,
      'no silent fallback to last-active for an explicit but unresolvable scope',
    )
  })
})

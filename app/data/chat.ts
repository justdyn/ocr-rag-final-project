/**
 * Chat completions proxy + conversation history reads for knowledge detail loaders.
 * data/ owns server fetch; do not import from clientEntry modules.
 */
import { backendFetch } from './backend.ts'
import type {
  ConversationSummary,
  PersistedMessage,
} from '../utils/chat-types.ts'

export type ChatCompletionsBody = {
  query: string
  conversation_id?: string | null
  k?: number
  /** Owned file ids to snapshot onto the persisted user message. */
  attachment_file_ids?: string[]
}

export type { ConversationSummary, PersistedMessage }

async function readDetail(response: Response): Promise<string> {
  try {
    let body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    return response.statusText || 'Request failed'
  } catch {
    return response.statusText || 'Request failed'
  }
}

/**
 * Call `POST /api/chat/completions` with `stream: true` and return a Response
 * suitable for the browser: either piped `text/event-stream` or the upstream
 * error body (503 llm_not_configured, 502 llm_upstream, etc.).
 */
export async function proxyKnowledgeChatStream(
  accessToken: string,
  knowledgeId: string,
  body: ChatCompletionsBody,
  signal?: AbortSignal,
): Promise<Response> {
  let upstream = await backendFetch('/api/chat/completions', {
    method: 'POST',
    accessToken,
    accept: 'text/event-stream',
    signal,
    body: {
      scope_type: 'knowledge',
      scope_id: knowledgeId,
      query: body.query,
      conversation_id: body.conversation_id ?? null,
      stream: true,
      ...(typeof body.k === 'number' ? { k: body.k } : {}),
      ...(body.attachment_file_ids?.length
        ? { attachment_file_ids: body.attachment_file_ids }
        : {}),
    },
  })

  if (!upstream.ok) {
    // FastAPI returns JSON `{detail}` before the SSE body starts (e.g. 503).
    let text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: {
        'Content-Type':
          upstream.headers.get('Content-Type') ?? 'application/json',
      },
    })
  }

  // Re-stream the backend body; do not buffer tokens on the Remix server.
  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

/** Newest-first conversation list for a knowledge base (empty array if none). */
export async function listKnowledgeConversations(
  accessToken: string,
  knowledgeId: string,
): Promise<ConversationSummary[]> {
  let response = await backendFetch(
    `/api/knowledge/${knowledgeId}/conversations`,
    { method: 'GET', accessToken },
  )
  if (response.status === 404) return []
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as ConversationSummary[]
}

/** Owned conversation metadata; null if missing/not owned. */
export async function getConversation(
  accessToken: string,
  conversationId: string,
): Promise<ConversationSummary | null> {
  let response = await backendFetch(`/api/conversations/${conversationId}`, {
    method: 'GET',
    accessToken,
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as ConversationSummary
}

/** Ordered messages for an owned conversation; null if missing/not owned. */
export async function getConversationMessages(
  accessToken: string,
  conversationId: string,
): Promise<PersistedMessage[] | null> {
  let response = await backendFetch(
    `/api/conversations/${conversationId}/messages`,
    { method: 'GET', accessToken },
  )
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as PersistedMessage[]
}

/** Last-active hydrate scope: KB of the user's most recent conversation (null if none). */
export async function getLastConversationScope(
  accessToken: string,
): Promise<{ knowledgeId: string; knowledgeName: string } | null> {
  let response = await backendFetch('/api/conversations/last', {
    method: 'GET',
    accessToken,
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  let scope = (await response.json()) as {
    knowledge_id: string
    knowledge_name: string
  } | null
  if (!scope) return null
  return {
    knowledgeId: scope.knowledge_id,
    knowledgeName: scope.knowledge_name,
  }
}

/**
 * Load messages for a known conversation id (path hydrate).
 * Does not require the id to appear in a KB conversation list first.
 */
export async function loadConversationChatHistory(
  accessToken: string,
  conversationId: string,
): Promise<{
  conversationId: string | null
  messages: PersistedMessage[]
}> {
  let messages = await getConversationMessages(accessToken, conversationId)
  if (messages === null) {
    return { conversationId: null, messages: [] }
  }
  return { conversationId, messages }
}

/**
 * Resolve which conversation to hydrate when only a knowledge id is known:
 * optional preferred id if it belongs to the KB, else the most recently updated thread.
 */
export async function loadKnowledgeChatHistory(
  accessToken: string,
  knowledgeId: string,
  preferredConversationId?: string | null,
): Promise<{
  conversationId: string | null
  messages: PersistedMessage[]
}> {
  let conversations = await listKnowledgeConversations(accessToken, knowledgeId)
  if (conversations.length === 0) {
    return { conversationId: null, messages: [] }
  }

  let conversationId =
    preferredConversationId &&
    conversations.some((row) => row.id === preferredConversationId)
      ? preferredConversationId
      : conversations[0]!.id

  return loadConversationChatHistory(accessToken, conversationId)
}

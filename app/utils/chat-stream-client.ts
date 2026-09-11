/**
 * Shared browser-side chat SSE helpers — reused by shell composer and knowledge panel (§2.5).
 * utils/ owns pure/stream logic; no imports from app/actions or remix/ui/server.
 */
import { routes } from '../routes.ts'
import { crossedSentenceBoundary } from './chat-citations.ts'
import type {
  ChatMessage,
  ChatSource,
  ChatStreamError,
  ChatStreamErrorCode,
} from './chat-types.ts'
import { consumeSseBuffer } from './sse-parse.ts'

export function newChatLocalId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export function mapChatHttpError(
  status: number,
  detail: string,
  code?: string,
): ChatStreamError {
  if (status === 503 || code === 'llm_not_configured') {
    return {
      code: 'llm_not_configured',
      detail:
        detail ||
        'The language model is not configured. Set LLM_API_KEY on the backend to enable answers.',
    }
  }
  if (status === 502 || code === 'llm_upstream') {
    return {
      code: 'llm_upstream',
      detail:
        detail ||
        'The language model provider failed or timed out. Try again in a moment.',
    }
  }
  return {
    code: (code as ChatStreamErrorCode) || 'http_error',
    detail: detail || `Chat request failed (${status}).`,
  }
}

export function chatErrorBannerCopy(error: ChatStreamError): {
  title: string
  body: string
} {
  switch (error.code) {
    case 'llm_not_configured':
      return { title: 'Language model not configured', body: error.detail }
    case 'llm_upstream':
      return { title: 'Language model unavailable', body: error.detail }
    case 'llm_error':
      return { title: 'Language model error', body: error.detail }
    case 'network':
      return { title: 'Connection problem', body: error.detail }
    default:
      return { title: 'Chat request failed', body: error.detail }
  }
}

export type ChatStreamMutableState = {
  messages: ChatMessage[]
  conversationId: string | null
  streamError: ChatStreamError | null
  animateLocalIds: Set<string>
}

export function applyChatSseFrame(
  event: string,
  data: unknown,
  state: ChatStreamMutableState,
  assistantIndex: number,
): void {
  if (assistantIndex < 0) return
  let current = state.messages[assistantIndex]!

  if (event === 'sources') {
    let payload = data as { sources?: ChatSource[]; conversation_id?: string }
    let sources = Array.isArray(payload.sources) ? payload.sources : []
    // Conversation is created in prepare_chat before tokens — pin it here so
    // the client can replaceState to /chat/:id before `done` (F5 mid-stream safe).
    if (typeof payload.conversation_id === 'string' && payload.conversation_id) {
      state.conversationId = payload.conversation_id
    }
    state.messages[assistantIndex] = { ...current, sources }
    return
  }

  if (event === 'token') {
    let payload = data as { delta?: string }
    let delta = typeof payload.delta === 'string' ? payload.delta : ''
    if (!delta) return
    let before = current.content
    let nextContent = before + delta
    if (crossedSentenceBoundary(before, delta)) {
      state.animateLocalIds.add(current.localId)
    }
    state.messages[assistantIndex] = { ...current, content: nextContent }
    return
  }

  if (event === 'done') {
    let payload = data as {
      conversation_id?: string
      message_id?: string
      incomplete?: boolean
    }
    if (typeof payload.conversation_id === 'string') {
      state.conversationId = payload.conversation_id
    }
    state.messages[assistantIndex] = {
      ...current,
      messageId:
        typeof payload.message_id === 'string' ? payload.message_id : current.messageId,
      incomplete: Boolean(payload.incomplete),
    }
    return
  }

  if (event === 'error') {
    let payload = data as { detail?: string; code?: string }
    let code = payload.code
    let detail =
      typeof payload.detail === 'string' ? payload.detail : 'Stream error from the model.'
    state.streamError = mapChatHttpError(
      code === 'llm_not_configured' ? 503 : code === 'llm_upstream' ? 502 : 500,
      detail,
      code,
    )
    if (current.content) {
      state.messages[assistantIndex] = { ...current, incomplete: true }
    }
  }
}

export async function parseChatErrorResponse(response: Response): Promise<{
  detail: string
  code?: string
}> {
  let detail = ''
  let code: string | undefined
  try {
    let payload = (await response.json()) as {
      detail?: unknown
      error?: unknown
      code?: unknown
    }
    if (typeof payload.detail === 'string') detail = payload.detail
    else if (typeof payload.error === 'string') detail = payload.error
    if (typeof payload.code === 'string') code = payload.code
  } catch {
    detail = response.statusText
  }
  return { detail, code }
}

/** POST to Remix SSE proxy and consume stream into mutable state. */
export async function runKnowledgeChatStream(params: {
  knowledgeId: string
  query: string
  conversationId: string | null
  attachmentFileIds?: string[]
  state: ChatStreamMutableState
  assistantLocalId: string
  signal?: AbortSignal
  onUpdate: () => void
}): Promise<void> {
  let { knowledgeId, query, state, assistantLocalId, signal, onUpdate } = params
  let conversationId = params.conversationId

  let response = await fetch(
    routes.knowledge.chatStream.completions.href({ knowledgeId }),
    {
      method: 'POST',
      headers: {
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        conversation_id: conversationId,
        ...(params.attachmentFileIds?.length
          ? { attachment_file_ids: params.attachmentFileIds }
          : {}),
      }),
      signal,
    },
  )

  if (!response.ok) {
    let { detail, code } = await parseChatErrorResponse(response)
    state.streamError = mapChatHttpError(response.status, detail, code)
    state.messages = state.messages.filter((m) => m.localId !== assistantLocalId)
    onUpdate()
    return
  }

  if (!response.body) {
    state.streamError = {
      code: 'network',
      detail: 'No response stream from the chat proxy.',
    }
    onUpdate()
    return
  }

  let reader = response.body.getReader()
  let decoder = new TextDecoder()
  let buffer = ''
  let assistantIndex = state.messages.findIndex((m) => m.localId === assistantLocalId)

  while (true) {
    let { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let { frames, rest } = consumeSseBuffer(buffer)
    buffer = rest

    for (let frame of frames) {
      applyChatSseFrame(frame.event, frame.data, state, assistantIndex)
      assistantIndex = state.messages.findIndex((m) => m.localId === assistantLocalId)
    }
    onUpdate()
  }

  if (buffer.trim()) {
    let { frames } = consumeSseBuffer(buffer + '\n\n')
    for (let frame of frames) {
      applyChatSseFrame(frame.event, frame.data, state, assistantIndex)
    }
  }
}

export function cloneInitialMessages(rows: ChatMessage[]): ChatMessage[] {
  return rows.map((m) => ({
    ...m,
    sources: [...m.sources],
    attachments: m.attachments ? [...m.attachments] : undefined,
  }))
}

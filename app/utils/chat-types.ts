/**
 * Chat / SSE shapes shared by server proxy and clientEntry UI.
 * utils/ (not data/) so browser modules never import the FastAPI client.
 */

export type ChatSource = {
  id: number
  chunk_id: string
  file_id: string
  text: string
  /** Present on sources created after filename enrichment; older rows may omit it. */
  filename?: string | null
  rrf_score: number | null
  rerank_score: number | null
  extraction_method: string | null
  rank: number | null
}

export type ChatRole = 'user' | 'assistant'

export type ChatMessage = {
  /** Client-local id for list keys (stable across streaming updates). */
  localId: string
  role: ChatRole
  content: string
  sources: ChatSource[]
  /** Set when the assistant turn finished (or failed after partial text). */
  incomplete?: boolean
  /** Server message id from `done` when available. */
  messageId?: string
}

export type ChatStreamErrorCode =
  | 'llm_not_configured'
  | 'llm_upstream'
  | 'llm_error'
  | 'http_error'
  | 'network'

export type ChatStreamError = {
  code: ChatStreamErrorCode
  detail: string
}

/** Lightweight conversation row from GET /api/knowledge/{id}/conversations. */
export type ConversationSummary = {
  id: string
  title: string | null
  created_at: number
  updated_at: number
}

/** Raw message row from GET /api/conversations/{id}/messages. */
export type PersistedMessage = {
  id: string
  conversation_id: string
  role: string
  content: string
  sources: unknown
  created_at: number
}

/**
 * Normalize persisted `sources` JSON (plain citation array, or incomplete wrapper
 * `{citations, incomplete, error}` from mid-stream failures) into chat UI shape.
 */
export function sourcesFromPersisted(raw: unknown): {
  sources: ChatSource[]
  incomplete: boolean
} {
  if (Array.isArray(raw)) {
    return { sources: raw as ChatSource[], incomplete: false }
  }
  if (raw && typeof raw === 'object') {
    let obj = raw as {
      citations?: unknown
      incomplete?: unknown
    }
    let citations = Array.isArray(obj.citations)
      ? (obj.citations as ChatSource[])
      : []
    return { sources: citations, incomplete: Boolean(obj.incomplete) }
  }
  return { sources: [], incomplete: false }
}

/** Map API message rows into client ChatMessage list for the panel. */
export function messagesFromPersisted(rows: PersistedMessage[]): ChatMessage[] {
  let out: ChatMessage[] = []
  for (let row of rows) {
    if (row.role !== 'user' && row.role !== 'assistant') continue
    let { sources, incomplete } = sourcesFromPersisted(row.sources)
    out.push({
      localId: row.id,
      role: row.role,
      content: row.content,
      sources,
      incomplete: incomplete || undefined,
      messageId: row.role === 'assistant' ? row.id : undefined,
    })
  }
  return out
}

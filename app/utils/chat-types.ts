/**
 * Chat / SSE shapes shared by server proxy and clientEntry UI.
 * utils/ (not data/) so browser modules never import the FastAPI client.
 */
import { isImageAttachmentName } from './composer-attachments.ts'

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

/** Attachment snapshot for user turns (keys match the backend JSON payload). */
export type ChatAttachment = {
  file_id: string
  filename: string
  content_type: string | null
  extraction_method: string | null
  ocr_confidence: number | null
  text_excerpt: string | null
}

export type ChatMessage = {
  /** Client-local id for stable list keys (stable across streaming updates). */
  localId: string
  role: ChatRole
  content: string
  sources: ChatSource[]
  /** Send-time attachment snapshot (user turns only). */
  attachments?: ChatAttachment[]
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

/** Lightweight conversation row (KB list or GET /api/conversations/{id}). */
export type ConversationSummary = {
  id: string
  title: string | null
  /** Present after title-meta migration; older clients may omit. */
  title_source?: string
  title_generated_at?: number | null
  /** Present on conversation-by-id; KB list rows omit it. */
  knowledge_id?: string | null
  /** Per-conversation generalist model id; null → server LLM_MODEL. */
  llm_model?: string | null
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
  /** Attachment snapshot JSON (None → null on assistant/legacy rows). */
  attachments?: unknown
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

/** Normalize persisted `attachments` JSON into UI shape (junk entries dropped). */
export function attachmentsFromPersisted(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return []
  let out: ChatAttachment[] = []
  for (let item of raw) {
    if (!item || typeof item !== 'object') continue
    let rec = item as Record<string, unknown>
    if (typeof rec.file_id !== 'string' || typeof rec.filename !== 'string') continue
    out.push({
      file_id: rec.file_id,
      filename: rec.filename,
      content_type: typeof rec.content_type === 'string' ? rec.content_type : null,
      extraction_method:
        typeof rec.extraction_method === 'string' ? rec.extraction_method : null,
      ocr_confidence:
        typeof rec.ocr_confidence === 'number' ? rec.ocr_confidence : null,
      text_excerpt: typeof rec.text_excerpt === 'string' ? rec.text_excerpt : null,
    })
  }
  return out
}

/** Image detection for attachment snapshots — a present content_type is decisive. */
export function attachmentIsImage(att: ChatAttachment): boolean {
  if (att.content_type) return att.content_type.startsWith('image/')
  return isImageAttachmentName(att.filename)
}

/** Map API message rows into client ChatMessage list for the panel. */
export function messagesFromPersisted(rows: PersistedMessage[]): ChatMessage[] {
  let out: ChatMessage[] = []
  for (let row of rows) {
    if (row.role !== 'user' && row.role !== 'assistant') continue
    let { sources, incomplete } = sourcesFromPersisted(row.sources)
    let attachments = attachmentsFromPersisted(row.attachments)
    out.push({
      localId: row.id,
      role: row.role,
      content: row.content,
      sources,
      attachments: attachments.length > 0 ? attachments : undefined,
      incomplete: incomplete || undefined,
      messageId: row.role === 'assistant' ? row.id : undefined,
    })
  }
  return out
}

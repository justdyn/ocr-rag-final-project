/**
 * Browser helpers for JSON knowledge BFF routes (create + add file).
 * Must not import app/data (server-only FastAPI client).
 */
import { routes } from '../routes.ts'
import type { KnowledgeRecord } from './knowledge-types.ts'
import type { AddFileResult, KnowledgeWriteResult } from './implicit-knowledge.ts'

export async function postCreateKnowledgeJson(input: {
  name: string
  description?: string | null
  meta?: Record<string, unknown> | null
}): Promise<KnowledgeWriteResult> {
  try {
    let response = await fetch(routes.knowledge.create.href(), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    })
    let payload = (await response.json()) as {
      knowledge?: KnowledgeRecord
      error?: string
    }
    if (!response.ok || !payload.knowledge) {
      return { ok: false, error: payload.error ?? 'Could not create knowledge base.' }
    }
    return { ok: true, id: payload.knowledge.id, name: payload.knowledge.name }
  } catch {
    return { ok: false, error: 'Could not create knowledge base. Check your connection.' }
  }
}

export async function postAddKnowledgeFileJson(
  knowledgeId: string,
  fileId: string,
): Promise<AddFileResult> {
  try {
    let response = await fetch(routes.knowledge.addFile.href({ knowledgeId }), {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ file_id: fileId }),
    })
    // 409 = already a member — treat as success so retries stay idempotent.
    if (response.ok || response.status === 409) return { ok: true }
    let payload = (await response.json()) as { error?: string }
    return { ok: false, error: payload.error ?? 'Could not add file to knowledge base.' }
  } catch {
    return { ok: false, error: 'Could not add file to knowledge base. Check your connection.' }
  }
}

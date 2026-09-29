/**
 * SPJ draft data helpers — server fetch against FastAPI; ownership, totals and
 * the confirm gate stay upstream. Do not import this module from clientEntry.
 */
import { backendFetch } from './backend.ts'
import { throwIfNotOk } from './files.ts'

export type SpjDraftRecord = {
  id: string
  knowledge_id: string
  fields: unknown
  document_total_computed: number
  confirmed: boolean
}

export async function createSpjDraft(
  accessToken: string,
  knowledgeId: string,
): Promise<SpjDraftRecord> {
  let response = await backendFetch(
    `/api/knowledge/${encodeURIComponent(knowledgeId)}/spj/draft`,
    { method: 'POST', accessToken },
  )
  await throwIfNotOk(response)
  return (await response.json()) as SpjDraftRecord
}

export async function getSpjDraft(
  accessToken: string,
  draftId: string,
): Promise<SpjDraftRecord> {
  let response = await backendFetch(`/api/spj/drafts/${encodeURIComponent(draftId)}`, {
    method: 'GET',
    accessToken,
  })
  await throwIfNotOk(response)
  return (await response.json()) as SpjDraftRecord
}

export async function confirmSpjDraft(
  accessToken: string,
  draftId: string,
): Promise<SpjDraftRecord> {
  let response = await backendFetch(
    `/api/spj/drafts/${encodeURIComponent(draftId)}/confirm`,
    { method: 'POST', accessToken },
  )
  await throwIfNotOk(response)
  return (await response.json()) as SpjDraftRecord
}

/**
 * Raw export passthrough — returns the upstream Response unbuffered; the
 * controller re-streams its body. Never consume the body here.
 */
export async function exportSpjDraft(
  accessToken: string,
  draftId: string,
): Promise<Response> {
  return backendFetch(`/api/spj/drafts/${encodeURIComponent(draftId)}/export`, {
    method: 'GET',
    accessToken,
  })
}

export async function patchSpjDraft(
  accessToken: string,
  draftId: string,
  lines: unknown[],
): Promise<SpjDraftRecord> {
  let response = await backendFetch(
    `/api/spj/drafts/${encodeURIComponent(draftId)}`,
    { method: 'PATCH', accessToken, body: JSON.stringify({ lines }) },
  )
  await throwIfNotOk(response)
  return (await response.json()) as SpjDraftRecord
}

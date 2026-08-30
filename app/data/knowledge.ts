/**
 * Knowledge API client for FastAPI `/api/knowledge/*`.
 * data/ owns server fetch — do not import this module from clientEntry code.
 */
import { backendFetch } from './backend.ts'
import type {
  KnowledgeListItem,
  KnowledgeRecord,
} from '../utils/knowledge-types.ts'

export type {
  KnowledgeFileMember,
  KnowledgeListItem,
  KnowledgeRecord,
} from '../utils/knowledge-types.ts'

async function readDetail(response: Response): Promise<string> {
  try {
    let body = (await response.json()) as { detail?: unknown }
    if (typeof body.detail === 'string') return body.detail
    return response.statusText || 'Request failed'
  } catch {
    return response.statusText || 'Request failed'
  }
}

export async function listKnowledge(
  accessToken: string,
): Promise<KnowledgeListItem[]> {
  let response = await backendFetch('/api/knowledge', {
    method: 'GET',
    accessToken,
  })
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as KnowledgeListItem[]
}

export async function getKnowledge(
  accessToken: string,
  knowledgeId: string,
): Promise<KnowledgeRecord | null> {
  let response = await backendFetch(`/api/knowledge/${knowledgeId}`, {
    method: 'GET',
    accessToken,
  })
  if (response.status === 404) return null
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as KnowledgeRecord
}

export async function createKnowledge(
  accessToken: string,
  input: {
    name: string
    description?: string | null
    meta?: Record<string, unknown> | null
  },
): Promise<KnowledgeRecord> {
  let response = await backendFetch('/api/knowledge', {
    method: 'POST',
    accessToken,
    body: {
      name: input.name,
      description: input.description ?? null,
      ...(input.meta ? { meta: input.meta } : {}),
    },
  })
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as KnowledgeRecord
}

export async function updateKnowledge(
  accessToken: string,
  knowledgeId: string,
  input: { name?: string; description?: string | null },
): Promise<KnowledgeRecord> {
  let response = await backendFetch(`/api/knowledge/${knowledgeId}`, {
    method: 'PATCH',
    accessToken,
    body: input,
  })
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as KnowledgeRecord
}

export async function deleteKnowledge(
  accessToken: string,
  knowledgeId: string,
): Promise<void> {
  let response = await backendFetch(`/api/knowledge/${knowledgeId}`, {
    method: 'DELETE',
    accessToken,
  })
  if (!response.ok && response.status !== 204) {
    throw new Error(await readDetail(response))
  }
}

export async function addKnowledgeFile(
  accessToken: string,
  knowledgeId: string,
  fileId: string,
): Promise<KnowledgeRecord> {
  let response = await backendFetch(`/api/knowledge/${knowledgeId}/files`, {
    method: 'POST',
    accessToken,
    body: { file_id: fileId },
  })
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as KnowledgeRecord
}

export async function removeKnowledgeFile(
  accessToken: string,
  knowledgeId: string,
  fileId: string,
): Promise<KnowledgeRecord> {
  let response = await backendFetch(
    `/api/knowledge/${knowledgeId}/files/${fileId}`,
    {
      method: 'DELETE',
      accessToken,
    },
  )
  if (!response.ok) {
    throw new Error(await readDetail(response))
  }
  return (await response.json()) as KnowledgeRecord
}

/**
 * Serializable knowledge shapes shared by server actions and clientEntry UI.
 * Kept in utils/ (not data/) so browser modules never import the FastAPI client.
 */

export type KnowledgeListItem = {
  id: string
  name: string
  description: string | null
  created_at: number
  updated_at: number
  file_count: number
}

export type KnowledgeFileMember = {
  file_id: string
  filename: string
  status: string
  extraction_method: string | null
  created_at: number
}

export type KnowledgeRecord = {
  id: string
  name: string
  description: string | null
  meta: Record<string, unknown> | null
  created_at: number
  updated_at: number
  file_ids: string[]
  files: KnowledgeFileMember[]
}

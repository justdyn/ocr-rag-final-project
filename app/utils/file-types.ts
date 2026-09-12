/**
 * Serializable file shapes shared by server actions and clientEntry UI.
 * Kept in utils/ (not data/) so browser modules never import the FastAPI client.
 */

export type FileStatusValue = 'pending' | 'processing' | 'ready' | 'failed' | string

/** JSON-safe meta bag for clientEntry hydration (no `unknown`). */
export type FileMeta = Record<string, string | number | boolean | null>

export type FileRecord = {
  id: string
  filename: string
  status: FileStatusValue
  extraction_method: string | null
  ocr_confidence: number | null
  hash: string | null
  meta: FileMeta | null
  created_at: number
  updated_at: number
}

export type FileStatusRecord = {
  id: string
  status: FileStatusValue
  extraction_method: string | null
  error: string | null
}

export function isActiveStatus(status: FileStatusValue): boolean {
  return status === 'pending' || status === 'processing'
}

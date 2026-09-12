/**
 * Pending chat knowledge after Library "Add to chat" — MainPanel reads once on mount.
 */
const STORAGE_KEY = 'docintel:pending-chat-knowledge'

export type PendingChatKnowledge = {
  id: string
  name: string
}

export function stashPendingChatKnowledge(id: string, name: string): void {
  if (typeof sessionStorage === 'undefined') return
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name } satisfies PendingChatKnowledge))
}

export function takePendingChatKnowledge(): PendingChatKnowledge | null {
  if (typeof sessionStorage === 'undefined') return null
  let raw = sessionStorage.getItem(STORAGE_KEY)
  if (!raw) return null
  sessionStorage.removeItem(STORAGE_KEY)
  try {
    let parsed = JSON.parse(raw) as PendingChatKnowledge
    if (typeof parsed?.id !== 'string' || typeof parsed?.name !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

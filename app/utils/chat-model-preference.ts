/**
 * Last-selected generalist LLM for empty `/` / New chat (client-only).
 * Conversation threads still hydrate from `conversation.llm_model`.
 */
export type PreferredChatModel = { id: string; name: string }

const STORAGE_KEY = 'docintel.chat.llm_model'

export function readPreferredChatModel(): PreferredChatModel | null {
  if (typeof sessionStorage === 'undefined') return null
  try {
    let raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    let parsed = JSON.parse(raw) as Partial<PreferredChatModel>
    let id = typeof parsed.id === 'string' ? parsed.id.trim() : ''
    if (!id) return null
    let name =
      typeof parsed.name === 'string' && parsed.name.trim()
        ? parsed.name.trim()
        : id
    return { id, name }
  } catch {
    return null
  }
}

export function writePreferredChatModel(model: PreferredChatModel): void {
  if (typeof sessionStorage === 'undefined') return
  let id = model.id.trim()
  if (!id) return
  let name = model.name.trim() || id
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ id, name }))
  } catch {
    /* private mode / quota — selection still works in-memory */
  }
}

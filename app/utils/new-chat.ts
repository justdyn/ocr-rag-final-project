/** Custom event so "New chat" can reset setup-scope state when already on `/`. */
export const NEW_CHAT_EVENT = 'tensho:new-chat'

/** Fired after the first successful chat completion creates/returns a conversation_id. */
export const CONVERSATION_UPSERT_EVENT = 'tensho:conversation-upsert'

export type ConversationUpsertDetail = {
  knowledgeId: string
  conversation: {
    id: string
    title: string | null
    created_at: number
    updated_at: number
  }
}

/** Match backend `_title_from_query` so optimistic sidebar rows look right before reload. */
export function conversationTitleFromQuery(query: string): string {
  let cleaned = query.trim().replace(/\s+/g, ' ')
  if (cleaned.length <= 80) return cleaned
  return `${cleaned.slice(0, 77)}...`
}

/** Prepend or replace a conversation row; newest-first when knowledge scope changes. */
export function upsertConversationList<T extends { id: string }>(
  current: T[],
  next: T,
  replaceScope: boolean,
): T[] {
  if (replaceScope) return [next]
  let without = current.filter((row) => row.id !== next.id)
  return [next, ...without]
}

export function isSamePath(currentHref: string, targetHref: string): boolean {
  let current = new URL(currentHref)
  let target = new URL(targetHref, currentHref)
  return current.pathname === target.pathname
}

export function dispatchNewChat(): void {
  window.dispatchEvent(new Event(NEW_CHAT_EVENT))
}

export function dispatchConversationUpsert(detail: ConversationUpsertDetail): void {
  window.dispatchEvent(new CustomEvent(CONVERSATION_UPSERT_EVENT, { detail }))
}

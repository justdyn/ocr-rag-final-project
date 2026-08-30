import { routes } from '../routes.ts'

/** Authenticated chat landing URL with optional KB + conversation scope. */
export function shellChatHref(
  knowledgeId?: string | null,
  conversationId?: string | null,
): string {
  let href = routes.home.href()
  if (!knowledgeId) return href
  let params = new URLSearchParams()
  params.set('knowledge', knowledgeId)
  if (conversationId) params.set('conversation', conversationId)
  return `${href}?${params.toString()}`
}

/** Fresh thread for a knowledge base (no conversation param). */
export function shellNewChatHref(knowledgeId: string): string {
  return shellChatHref(knowledgeId, null)
}

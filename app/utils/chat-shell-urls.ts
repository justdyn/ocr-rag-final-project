import { routes } from '../routes.ts'

/** Open-thread URL: `/chat/:conversationId`. Missing id → empty landing `/`. */
export function shellChatHref(conversationId?: string | null): string {
  if (!conversationId) return routes.home.href()
  return routes.chat.show.href({ conversationId })
}

/** Fresh empty chat (no conversation identity yet). */
export function shellNewChatHref(): string {
  return routes.home.href()
}

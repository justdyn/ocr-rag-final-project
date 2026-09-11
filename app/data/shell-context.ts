/**
 * Server-side props for unified chat shell sidebar + chat landing (data/, §2.1).
 */
import {
  getLastConversationScope,
  listKnowledgeConversations,
  loadKnowledgeChatHistory,
} from './chat.ts'
import { fetchCurrentUser } from './auth.ts'
import { getKnowledge } from './knowledge.ts'
import type { ConversationSummary, PersistedMessage } from '../utils/chat-types.ts'

export type ShellKnowledgeOption = {
  id: string
  name: string
}

export type ChatShellServerContext = {
  knowledgeBases: ShellKnowledgeOption[]
  activeKnowledgeId: string | null
  activeKnowledgeName: string | null
  /** Chat composer scope — only from `?knowledge=`, never auto-picked. */
  chatKnowledgeId: string | null
  chatKnowledgeName: string | null
  conversations: ConversationSummary[]
  activeConversationId: string | null
  initialMessages: PersistedMessage[]
  /** From GET /api/auth/me — sidebar account avatar + label. */
  userName: string
  userEmail: string
}

/**
 * Hydrate shell chrome for authenticated routes: optional URL knowledge,
 * sidebar conversations, and optional chat thread.
 *
 * Composer scope (`chatKnowledgeId`) only ever comes from `?knowledge=` —
 * never auto-picked. Without `?knowledge=`, the sidebar alone hydrates from
 * the user's last active knowledge (most recent conversation's KB) so the
 * recent-chats list survives a full remount. Never the "first knowledge base"
 * from the KB listing, and never a fallback for an explicit but unresolvable
 * `?knowledge=`.
 */
export async function loadChatShellServerContext(
  accessToken: string,
  opts: {
    preferredKnowledgeId?: string | null
    preferredConversationId?: string | null
    hydrateChat?: boolean
  } = {},
): Promise<ChatShellServerContext> {
  let chatKnowledgeId: string | null = null
  let chatKnowledgeName: string | null = null
  let knowledgeBases: ShellKnowledgeOption[] = []

  if (opts.preferredKnowledgeId) {
    let record = await getKnowledge(accessToken, opts.preferredKnowledgeId).catch(
      () => null,
    )
    if (record) {
      chatKnowledgeId = record.id
      chatKnowledgeName = record.name
      knowledgeBases = [{ id: record.id, name: record.name }]
    }
  }

  let activeKnowledgeId = chatKnowledgeId
  let activeKnowledgeName = chatKnowledgeName

  // Sidebar-only hydrate: without `?knowledge=`, scope the recent-chats list
  // to the user's last active knowledge. Composer scope stays null.
  if (!opts.preferredKnowledgeId) {
    let last = await getLastConversationScope(accessToken).catch(() => null)
    if (last) {
      activeKnowledgeId = last.knowledgeId
      activeKnowledgeName = last.knowledgeName
    }
  }

  let conversations: ConversationSummary[] = []
  let activeConversationId: string | null = null
  let initialMessages: PersistedMessage[] = []
  let userName = ''
  let userEmail = ''

  let me = await fetchCurrentUser(accessToken)
  if (me.ok) {
    userName = me.data.name
    userEmail = me.data.email
  }

  if (activeKnowledgeId) {
    conversations = await listKnowledgeConversations(
      accessToken,
      activeKnowledgeId,
    ).catch(() => [])
  }

  if (opts.hydrateChat && chatKnowledgeId && opts.preferredConversationId) {
    let history = await loadKnowledgeChatHistory(
      accessToken,
      chatKnowledgeId,
      opts.preferredConversationId,
    ).catch(() => ({
      conversationId: null as string | null,
      messages: [] as PersistedMessage[],
    }))
    activeConversationId = history.conversationId
    initialMessages = history.messages
  }

  return {
    knowledgeBases,
    activeKnowledgeId,
    activeKnowledgeName,
    chatKnowledgeId,
    chatKnowledgeName,
    conversations,
    activeConversationId,
    initialMessages,
    userName,
    userEmail,
  }
}

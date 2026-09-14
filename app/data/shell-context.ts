/**
 * Server-side props for unified chat shell sidebar + chat landing (data/, §2.1).
 */
import {
  getConversation,
  getConversationMessages,
  getLastConversationScope,
  listKnowledgeConversations,
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
  /** Chat composer scope — from opened conversation's KB (or explicit preferred). */
  chatKnowledgeId: string | null
  chatKnowledgeName: string | null
  conversations: ConversationSummary[]
  activeConversationId: string | null
  /** Hydrated generalist model for the open thread (null on empty `/`). */
  initialLlmModel: string | null
  initialMessages: PersistedMessage[]
  /** From GET /api/auth/me — sidebar account avatar + label. */
  userName: string
  userEmail: string
  /** preferredConversationId was set but missing/not owned → controller returns 404. */
  conversationNotFound: boolean
}

/**
 * Hydrate shell chrome for authenticated routes: optional conversation path,
 * sidebar conversations, and optional chat thread.
 *
 * Composer scope (`chatKnowledgeId`) comes from the opened conversation's
 * `knowledge_id` (or an explicit preferred knowledge id). Without a conversation,
 * the sidebar alone hydrates from the user's last active knowledge so the
 * recent-chats list survives a full remount. Never the "first knowledge base"
 * from the KB listing.
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
  let activeConversationId: string | null = null
  let initialLlmModel: string | null = null
  let initialMessages: PersistedMessage[] = []
  let conversationMissing = false

  if (opts.hydrateChat && opts.preferredConversationId) {
    let summary = await getConversation(accessToken, opts.preferredConversationId)
    if (!summary) {
      conversationMissing = true
    } else {
      activeConversationId = summary.id
      initialLlmModel = summary.llm_model?.trim() || null
      let messages = await getConversationMessages(accessToken, summary.id)
      // Owned meta with a missing messages payload → empty thread (not 404).
      initialMessages = messages ?? []
      if (summary.knowledge_id) {
        let record = await getKnowledge(accessToken, summary.knowledge_id).catch(
          () => null,
        )
        if (record) {
          chatKnowledgeId = record.id
          chatKnowledgeName = record.name
          knowledgeBases = [{ id: record.id, name: record.name }]
        }
      }
    }
  } else if (opts.preferredKnowledgeId) {
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

  // Sidebar-only hydrate: without an opened conversation / preferred KB, scope
  // the recent-chats list to the user's last active knowledge. Composer stays null.
  if (!opts.preferredConversationId && !opts.preferredKnowledgeId) {
    let last = await getLastConversationScope(accessToken).catch(() => null)
    if (last) {
      activeKnowledgeId = last.knowledgeId
      activeKnowledgeName = last.knowledgeName
    }
  }

  let conversations: ConversationSummary[] = []
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

  return {
    knowledgeBases,
    activeKnowledgeId,
    activeKnowledgeName,
    chatKnowledgeId,
    chatKnowledgeName,
    conversations,
    activeConversationId: conversationMissing ? null : activeConversationId,
    initialLlmModel: conversationMissing ? null : initialLlmModel,
    initialMessages: conversationMissing ? [] : initialMessages,
    userName,
    userEmail,
    conversationNotFound: conversationMissing,
  }
}

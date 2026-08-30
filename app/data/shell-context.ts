/**
 * Server-side props for unified chat shell sidebar + chat landing (data/, §2.1).
 */
import {
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
 * sidebar conversations for that knowledge only, and optional chat thread.
 *
 * Never fall back to "first knowledge base" — leftover/manual KBs must not
 * become an unrelated new chat's sidebar or composer scope.
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

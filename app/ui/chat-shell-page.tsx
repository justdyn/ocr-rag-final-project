/**
 * Document + shell wrapper for LLM chat (`/` and `/chat/:id`).
 * Non-chat routes use AppShellPage.
 */
import type { Handle } from 'remix/ui'

import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import type { ConversationSummary } from '../utils/chat-types.ts'
import { messagesFromPersisted, type PersistedMessage } from '../utils/chat-types.ts'
import { ChatShellHead } from './chat-shell-head.tsx'
import { ChatShellLayout } from './chat-shell-layout.tsx'
import { ChatShellMainPanel } from './chat-shell-main-panel.tsx'
import { Document } from './document.tsx'
import type { ShellActiveNav } from './chat-sidebar.tsx'

export type ChatShellPageProps = {
  title?: string
  authenticated?: boolean
  activeNav?: ShellActiveNav
  activeKnowledgeId?: string | null
  /** Composer scope on `/` — omit/null so attach can auto-create a KB. */
  chatKnowledgeId?: string | null
  chatKnowledgeName?: string | null
  activeConversationId?: string | null
  /** Hydrated generalist model for an open thread. */
  initialLlmModel?: string | null
  conversations?: ConversationSummary[]
  initialMessages?: PersistedMessage[]
  /** Logged-in user from /api/auth/me — sidebar account row. */
  userName?: string
  userEmail?: string
  /** Logged-in user role from /api/auth/me — admin-gated UI (Settings → LLM / API). */
  userRole?: string
  userProfileImageUrl?: string | null
}

export function ChatShellPage(handle: Handle<ChatShellPageProps>) {
  return () => {
    let {
      title = SHELL_COPY.title,
      authenticated = false,
      activeNav = 'chat',
      activeKnowledgeId = null,
      chatKnowledgeId = null,
      chatKnowledgeName = null,
      activeConversationId = null,
      initialLlmModel = null,
      conversations = [],
      initialMessages = [],
      userName = '',
      userEmail = '',
      userRole = '',
      userProfileImageUrl = null,
    } = handle.props

    return (
      <Document head={<ChatShellHead />} title={title}>
        <ChatShellLayout
          authenticated={authenticated}
          activeNav={activeNav}
          activeKnowledgeId={activeKnowledgeId}
          activeConversationId={activeConversationId}
          conversations={conversations}
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          userProfileImageUrl={userProfileImageUrl}
        >
          <ChatShellMainPanel
            authenticated={authenticated}
            activeKnowledgeId={chatKnowledgeId}
            activeKnowledgeName={chatKnowledgeName}
            initialConversationId={activeConversationId}
            initialLlmModel={initialLlmModel}
            initialMessages={messagesFromPersisted(initialMessages)}
          />
        </ChatShellLayout>
      </Document>
    )
  }
}

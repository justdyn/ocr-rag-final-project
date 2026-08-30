/**
 * Document + unified shell wrapper for `/` chat landing (app/ui/, §2.1).
 */
import type { Handle, RemixNode } from 'remix/ui'

import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import type { ConversationSummary } from '../utils/chat-types.ts'
import { messagesFromPersisted, type PersistedMessage } from '../utils/chat-types.ts'
import { ChatShellContentMain } from './chat-shell-content-main.tsx'
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
  activeKnowledgeName?: string | null
  /** Composer scope on `/` — omit/null so attach can auto-create a KB. */
  chatKnowledgeId?: string | null
  chatKnowledgeName?: string | null
  activeConversationId?: string | null
  conversations?: ConversationSummary[]
  initialMessages?: PersistedMessage[]
  /** Logged-in user from /api/auth/me — sidebar account row. */
  userName?: string
  userEmail?: string
  /** Optional slot for non-chat shell bodies (unused after Files/Knowledge removal). */
  children?: RemixNode
}

export function ChatShellPage(handle: Handle<ChatShellPageProps>) {
  return () => {
    let {
      title = SHELL_COPY.title,
      authenticated = false,
      activeNav = 'chat',
      activeKnowledgeId = null,
      activeKnowledgeName = null,
      chatKnowledgeId = null,
      chatKnowledgeName = null,
      activeConversationId = null,
      conversations = [],
      initialMessages = [],
      userName = '',
      userEmail = '',
      children,
    } = handle.props

    let mainColumn = children ? (
      <ChatShellContentMain authenticated={authenticated} knowledgeName={activeKnowledgeName}>
        {children}
      </ChatShellContentMain>
    ) : (
      <ChatShellMainPanel
        authenticated={authenticated}
        activeKnowledgeId={chatKnowledgeId}
        activeKnowledgeName={chatKnowledgeName}
        initialConversationId={activeConversationId}
        initialMessages={messagesFromPersisted(initialMessages)}
      />
    )

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
        >
          {mainColumn}
        </ChatShellLayout>
      </Document>
    )
  }
}

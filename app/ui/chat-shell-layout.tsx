/**
 * Unified ChatGPT-style app chrome — sidebar + main column (app/ui/, §2.1).
 */
import type { Handle, RemixNode } from 'remix/ui'

import { shellStyle } from './styles/chat-shell/shell-styles.ts'
import { ChatSidebar, type ShellActiveNav } from './chat-sidebar.tsx'
import type { ConversationSummary } from '../utils/chat-types.ts'

export type ChatShellLayoutProps = {
  authenticated?: boolean
  activeNav?: ShellActiveNav
  activeKnowledgeId?: string | null
  activeConversationId?: string | null
  conversations?: ConversationSummary[]
  userName?: string
  userEmail?: string
  userRole?: string
  userProfileImageUrl?: string | null
  /** Main column — chat panel or DocIntel content wrapper. */
  children?: RemixNode
}

export function ChatShellLayout(handle: Handle<ChatShellLayoutProps>) {
  return () => {
    let {
      authenticated = false,
      activeNav = 'chat',
      activeKnowledgeId = null,
      activeConversationId = null,
      conversations = [],
      userName = '',
      userEmail = '',
      userRole = '',
      userProfileImageUrl = null,
      children,
    } = handle.props

    return (
      <div mix={shellStyle}>
        <ChatSidebar
          authenticated={authenticated}
          activeNav={activeNav}
          activeKnowledgeId={activeKnowledgeId}
          activeConversationId={activeConversationId}
          conversations={conversations}
          userName={userName}
          userEmail={userEmail}
          userRole={userRole}
          userProfileImageUrl={userProfileImageUrl}
        />
        {children}
      </div>
    )
  }
}

/**
 * Document + shell chrome for non-chat pages (Profile, Help, Library, SPJ review).
 * Chat LLM surface stays on ChatShellPage.
 */
import type { Handle, RemixNode } from 'remix/ui'

import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import type { ShellLucideIconKey } from '../utils/chat-shell-icons.ts'
import type { ConversationSummary } from '../utils/chat-types.ts'
import { ChatShellContentMain } from './chat-shell-content-main.tsx'
import { ChatShellHead } from './chat-shell-head.tsx'
import { ChatShellLayout } from './chat-shell-layout.tsx'
import { Document } from './document.tsx'
import type { ShellActiveNav } from './chat-sidebar.tsx'

export type AppShellPageProps = {
  /** Document <title>. */
  title?: string
  /** Main header page label (never last-KB / Chat — …). */
  pageTitle: string
  authenticated?: boolean
  activeNav?: ShellActiveNav
  activeKnowledgeId?: string | null
  activeConversationId?: string | null
  conversations?: ConversationSummary[]
  userName?: string
  userEmail?: string
  userRole?: string
  userProfileImageUrl?: string | null
  children?: RemixNode
  trailingActionHref?: string | null
  trailingActionLabel?: string | null
  trailingActionIcon?: ShellLucideIconKey | null
  contentAlign?: 'start' | 'center'
}

export function AppShellPage(handle: Handle<AppShellPageProps>) {
  return () => {
    let {
      title = SHELL_COPY.title,
      pageTitle,
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
      trailingActionHref = null,
      trailingActionLabel = null,
      trailingActionIcon = null,
      contentAlign = 'start',
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
          <ChatShellContentMain
            authenticated={authenticated}
            knowledgeName={pageTitle}
            trailingActionHref={trailingActionHref}
            trailingActionLabel={trailingActionLabel}
            trailingActionIcon={trailingActionIcon}
            contentAlign={contentAlign}
          >
            {children}
          </ChatShellContentMain>
        </ChatShellLayout>
      </Document>
    )
  }
}

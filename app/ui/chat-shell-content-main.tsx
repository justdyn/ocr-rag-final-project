/**
 * Server-side content column for Files/Knowledge inside grayscale shell (§3.5 + accepted contrast).
 * Header is a sibling clientEntry so mobile sidebar-open hydrates without nesting LibraryPanel.
 */
import type { Handle, RemixNode } from 'remix/ui'

import type { ShellLucideIconKey } from '../utils/chat-shell-icons.ts'
import { ChatShellContentHeader } from './chat-shell-content-header.tsx'
import {
  contentPanelCenterStyle,
  contentPanelStyle,
  mainContentWideStyle,
  mainStyle,
} from './styles/chat-shell/main-styles.ts'

export type ChatShellContentMainProps = {
  authenticated?: boolean
  knowledgeName?: string | null
  children?: RemixNode
  trailingActionHref?: string | null
  trailingActionLabel?: string | null
  trailingActionIcon?: ShellLucideIconKey | null
  /** Profile view: fill scroller and center children. Default start (top). */
  contentAlign?: 'start' | 'center'
}

export function ChatShellContentMain(handle: Handle<ChatShellContentMainProps>) {
  return () => {
    let {
      authenticated = true,
      knowledgeName = null,
      children,
      trailingActionHref = null,
      trailingActionLabel = null,
      trailingActionIcon = null,
      contentAlign = 'start',
    } = handle.props

    return (
      <div mix={mainStyle}>
        <ChatShellContentHeader
          authenticated={authenticated}
          knowledgeName={knowledgeName}
          glassChrome
          trailingActionHref={trailingActionHref}
          trailingActionLabel={trailingActionLabel}
          trailingActionIcon={trailingActionIcon}
        />
        {/* Own scroll container — opts out of the root Lenis hijack (§4.3). */}
        <main mix={mainContentWideStyle} data-lenis-prevent="">
          <div
            mix={
              contentAlign === 'center'
                ? [contentPanelStyle, contentPanelCenterStyle]
                : contentPanelStyle
            }
          >
            {children}
          </div>
        </main>
      </div>
    )
  }
}

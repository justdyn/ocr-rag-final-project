/**
 * Server-side content column for Files/Knowledge inside grayscale shell (§3.5 + accepted contrast).
 */
import type { Handle, RemixNode } from 'remix/ui'

import { ShellMainHeader } from './chat-shell/main-header.tsx'
import {
  contentPanelStyle,
  mainContentWideStyle,
  mainStyle,
} from './styles/chat-shell/main-styles.ts'

export type ChatShellContentMainProps = {
  authenticated?: boolean
  knowledgeName?: string | null
  children?: RemixNode
}

export function ChatShellContentMain(handle: Handle<ChatShellContentMainProps>) {
  return () => {
    let { authenticated = true, knowledgeName = null, children } = handle.props

    return (
      <div mix={mainStyle}>
        <ShellMainHeader authenticated={authenticated} knowledgeName={knowledgeName} />
        {/* Own scroll container — opts out of the root Lenis hijack (§4.3). */}
        <main mix={mainContentWideStyle} data-lenis-prevent="">
          <div mix={contentPanelStyle}>{children}</div>
        </main>
      </div>
    )
  }
}

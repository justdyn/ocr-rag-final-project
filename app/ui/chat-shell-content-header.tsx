/**
 * Hydrated header for non-chat shell bodies (Library, etc.).
 * Sibling clientEntry — do not nest under LibraryPanel (nested clientEntry does not hydrate).
 */
import { clientEntry, type Handle, type SerializableProps } from 'remix/ui'

import type { ShellLucideIconKey } from '../utils/chat-shell-icons.ts'
import { ShellMainHeader } from './chat-shell/main-header.tsx'

export interface ChatShellContentHeaderProps extends SerializableProps {
  authenticated?: boolean
  knowledgeName?: string | null
  /** Shared shell glass overlay (AppShell content pages). */
  glassChrome?: boolean
  trailingActionHref?: string | null
  trailingActionLabel?: string | null
  trailingActionIcon?: ShellLucideIconKey | null
}

export const ChatShellContentHeader = clientEntry(
  import.meta.url,
  function ChatShellContentHeader(handle: Handle<ChatShellContentHeaderProps>) {
    return () => {
      let {
        authenticated = true,
        knowledgeName = null,
        glassChrome = true,
        trailingActionHref = null,
        trailingActionLabel = null,
        trailingActionIcon = null,
      } = handle.props
      return (
        <ShellMainHeader
          authenticated={authenticated}
          knowledgeName={knowledgeName}
          glassChrome={glassChrome}
          trailingActionHref={trailingActionHref}
          trailingActionLabel={trailingActionLabel}
          trailingActionIcon={trailingActionIcon}
        />
      )
    }
  },
)

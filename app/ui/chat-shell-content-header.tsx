/**
 * Hydrated header for non-chat shell bodies (Library, etc.).
 * Sibling clientEntry — do not nest under LibraryPanel (nested clientEntry does not hydrate).
 */
import { clientEntry, type Handle, type SerializableProps } from 'remix/ui'

import { ShellMainHeader } from './chat-shell/main-header.tsx'

export interface ChatShellContentHeaderProps extends SerializableProps {
  authenticated?: boolean
  knowledgeName?: string | null
}

export const ChatShellContentHeader = clientEntry(
  import.meta.url,
  function ChatShellContentHeader(handle: Handle<ChatShellContentHeaderProps>) {
    return () => {
      let { authenticated = true, knowledgeName = null } = handle.props
      return (
        <ShellMainHeader authenticated={authenticated} knowledgeName={knowledgeName} />
      )
    }
  },
)

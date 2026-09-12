/**
 * Library route — owner file browser inside chat shell chrome.
 */
import { createController } from 'remix/router'

import { listFiles, FilesApiError, type FileRecord } from '../../data/files.ts'
import { loadChatShellServerContext } from '../../data/shell-context.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'
import { ChatShellPage } from '../../ui/chat-shell-page.tsx'
import { LibraryPanel } from '../../ui/library-panel.tsx'

export default createController(routes.library, {
  actions: {
    async index({ session, render }) {
      let auth = requireAuthFromSession(session, routes.library.index.href())
      if (auth instanceof Response) return auth

      let shell = await loadChatShellServerContext(auth, { hydrateChat: false })
      let files: FileRecord[] = []
      try {
        files = await listFiles(auth)
      } catch (error) {
        if (!(error instanceof FilesApiError)) {
          console.error('library listFiles failed', error)
        }
      }

      return render(
        <ChatShellPage
          title="Library"
          authenticated
          activeNav="library"
          activeKnowledgeId={shell.activeKnowledgeId}
          activeKnowledgeName={shell.activeKnowledgeName}
          chatKnowledgeId={shell.chatKnowledgeId}
          chatKnowledgeName={shell.chatKnowledgeName}
          activeConversationId={shell.activeConversationId}
          conversations={shell.conversations}
          userName={shell.userName}
          userEmail={shell.userEmail}
        >
          <LibraryPanel initialFiles={files} />
        </ChatShellPage>,
      )
    },
  },
})

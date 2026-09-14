/**
 * Library route — owner file browser inside chat shell chrome.
 */
import { createController } from 'remix/router'

import {
  listFiles,
  FilesApiError,
  type FileListPage,
} from '../../data/files.ts'
import { loadChatShellServerContext } from '../../data/shell-context.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'
import { ChatShellPage } from '../../ui/chat-shell-page.tsx'
import { LibraryPanel } from '../../ui/library-panel.tsx'

const EMPTY_PAGE: FileListPage = {
  items: [],
  page: 1,
  limit: 10,
  total: 0,
  has_more: false,
}

export default createController(routes.library, {
  actions: {
    async index({ session, render }) {
      let auth = requireAuthFromSession(session, routes.library.index.href())
      if (auth instanceof Response) return auth

      let shell = await loadChatShellServerContext(auth, { hydrateChat: false })
      let initialPage: FileListPage = EMPTY_PAGE
      try {
        initialPage = await listFiles(auth, { page: 1, limit: 10, type: 'all' })
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
          <LibraryPanel initialPage={initialPage} />
        </ChatShellPage>,
      )
    },
  },
})

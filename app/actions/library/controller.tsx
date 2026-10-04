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
import { AppShellPage } from '../../ui/app-shell-page.tsx'
import { LibraryPanel } from '../../ui/library-panel.tsx'
import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'

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
        <AppShellPage
          title="Library"
          pageTitle={SHELL_COPY.library}
          authenticated
          activeNav="library"
          activeKnowledgeId={shell.activeKnowledgeId}
          activeConversationId={shell.activeConversationId}
          conversations={shell.conversations}
          userName={shell.userName}
          userEmail={shell.userEmail}
          userRole={shell.userRole}
          userProfileImageUrl={shell.userProfileImageUrl}
        >
          <LibraryPanel initialPage={initialPage} />
        </AppShellPage>,
      )
    },
  },
})

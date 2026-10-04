/**
 * Help route — static FAQ page inside app shell chrome.
 * Controllers stay thin: parse, call data/UI, return Response (styleguide §2.4).
 */
import { createController } from 'remix/router'

import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { loadChatShellServerContext } from '../../data/shell-context.ts'
import { routes } from '../../routes.ts'
import { AppShellPage } from '../../ui/app-shell-page.tsx'
import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { HelpPanel } from './help-panel.tsx'

export default createController(routes.help, {
  actions: {
    async index({ session, render }) {
      let auth = requireAuthFromSession(session, routes.help.index.href())
      if (auth instanceof Response) return auth

      let shell = await loadChatShellServerContext(auth, { hydrateChat: false })

      return render(
        <AppShellPage
          title="Help"
          pageTitle={SHELL_COPY.help}
          authenticated
          activeNav="help"
          activeKnowledgeId={shell.activeKnowledgeId}
          activeConversationId={shell.activeConversationId}
          conversations={shell.conversations}
          userName={shell.userName}
          userEmail={shell.userEmail}
          userRole={shell.userRole}
          userProfileImageUrl={shell.userProfileImageUrl}
        >
          <HelpPanel />
        </AppShellPage>,
      )
    },
  },
})

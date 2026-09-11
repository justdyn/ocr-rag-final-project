import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import { assetServer } from '../assets.ts'
import { loadChatShellServerContext } from '../data/shell-context.ts'
import { logoutUser } from '../data/auth.ts'
import { getAccessToken, clearAccessToken } from '../middleware/session.ts'
import { HomePage } from './home-page.tsx'
import { routes } from '../routes.ts'
import { loginHref } from '../utils/login-href.ts'

export default createController(routes, {
  actions: {
    async assets(context) {
      return (
        (await assetServer.fetch(context.request)) ?? new Response('Not Found', { status: 404 })
      )
    },

    async home({ session, render, request }) {
      let token = getAccessToken(session)
      if (!token) {
        // Anonymous home is the onboarding splash (`?welcome=1`). Direct /login is the form.
        return redirect(loginHref({ welcome: true }), 303)
      }

      let url = new URL(request.url)
      let legacyConversation = url.searchParams.get('conversation')
      if (legacyConversation) {
        return redirect(
          routes.chat.show.href({ conversationId: legacyConversation }),
          303,
        )
      }

      // Empty/new chat: sidebar may still one-KB-list hydrate; no query identity.
      let shell = await loadChatShellServerContext(token, {
        hydrateChat: true,
      })

      return render(
        <HomePage
          authenticated
          activeNav="chat"
          activeKnowledgeId={shell.activeKnowledgeId}
          activeKnowledgeName={shell.activeKnowledgeName}
          chatKnowledgeId={shell.chatKnowledgeId}
          chatKnowledgeName={shell.chatKnowledgeName}
          activeConversationId={shell.activeConversationId}
          conversations={shell.conversations}
          initialMessages={shell.initialMessages}
          userName={shell.userName}
          userEmail={shell.userEmail}
        />,
      )
    },

    async logout({ session }) {
      await logoutUser()
      clearAccessToken(session)
      return redirect(loginHref(), 303)
    },
  },
})

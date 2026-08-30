import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import { assetServer } from '../assets.ts'
import { loadChatShellServerContext } from '../data/shell-context.ts'
import { logoutUser } from '../data/auth.ts'
import { getAccessToken, clearAccessToken } from '../middleware/session.ts'
import { HomePage } from './home-page.tsx'
import { routes } from '../routes.ts'

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
        return render(<HomePage authenticated={false} activeNav="chat" />)
      }

      let url = new URL(request.url)
      let shell = await loadChatShellServerContext(token, {
        preferredKnowledgeId: url.searchParams.get('knowledge'),
        preferredConversationId: url.searchParams.get('conversation'),
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
      return redirect(routes.home.href(), 303)
    },
  },
})

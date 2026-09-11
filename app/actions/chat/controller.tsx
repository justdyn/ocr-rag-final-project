/**
 * GET /chat/:conversationId — open conversation by path identity.
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import { loadChatShellServerContext } from '../../data/shell-context.ts'
import { getAccessToken } from '../../middleware/session.ts'
import { routes } from '../../routes.ts'
import { loginHref } from '../../utils/login-href.ts'
import { HomePage } from '../home-page.tsx'

export default createController(routes.chat, {
  actions: {
    async show({ session, render, params }) {
      let token = getAccessToken(session)
      if (!token) {
        return redirect(
          loginHref({ returnTo: routes.chat.show.href(params) }),
          303,
        )
      }

      let shell = await loadChatShellServerContext(token, {
        preferredConversationId: params.conversationId,
        hydrateChat: true,
      })

      if (shell.conversationNotFound) {
        return new Response('Not Found', { status: 404 })
      }

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
  },
})

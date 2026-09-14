/**
 * GET /chat/:conversationId — open conversation by path identity.
 * PATCH /chat/:conversationId — rename proxy (thin; upstream status/body passthrough).
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import { patchConversation, renameConversation } from '../../data/chat.ts'
import { loadChatShellServerContext } from '../../data/shell-context.ts'
import { getAccessToken } from '../../middleware/session.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'
import { loginHref } from '../../utils/login-href.ts'
import { HomePage } from '../home-page.tsx'

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export default createController(routes.chat, {
  actions: {
    async rename({ session, params, request }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      let body = (await readJsonBody(request)) as {
        title?: unknown
        llm_model?: unknown
      } | null
      let title =
        typeof body?.title === 'string' ? body.title.trim() : undefined
      let llmModel =
        typeof body?.llm_model === 'string' ? body.llm_model.trim() : undefined

      if (title !== undefined && !title) {
        return Response.json(
          { error: 'Enter a name for the conversation.' },
          { status: 400 },
        )
      }
      if (title === undefined && !llmModel) {
        return Response.json(
          { error: 'Provide title and/or llm_model.' },
          { status: 400 },
        )
      }

      try {
        if (title !== undefined && llmModel) {
          return await patchConversation(auth, params.conversationId, {
            title,
            llm_model: llmModel,
          })
        }
        if (llmModel) {
          return await patchConversation(auth, params.conversationId, {
            llm_model: llmModel,
          })
        }
        return await renameConversation(auth, params.conversationId, title!)
      } catch {
        return Response.json(
          { error: 'Could not update the conversation.' },
          { status: 502 },
        )
      }
    },

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
          initialLlmModel={shell.initialLlmModel}
          conversations={shell.conversations}
          initialMessages={shell.initialMessages}
          userName={shell.userName}
          userEmail={shell.userEmail}
        />,
      )
    },
  },
})

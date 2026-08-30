/**
 * Nested SSE proxy for knowledge-scoped chat.
 * Separate controller so knowledge CRUD stays thin (§2.4 / §2.7).
 */
import { createController } from 'remix/router'

import { proxyKnowledgeChatStream } from '../../../data/chat.ts'
import { requireAuthFromSession } from '../../../middleware/require-auth.ts'
import { routes } from '../../../routes.ts'

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export default createController(routes.knowledge.chatStream, {
  actions: {
    async completions({ session, params, request }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      let body = (await readJsonBody(request)) as {
        query?: unknown
        conversation_id?: unknown
        k?: unknown
      } | null

      let query = typeof body?.query === 'string' ? body.query.trim() : ''
      if (!query) {
        return Response.json({ error: 'Enter a question.' }, { status: 400 })
      }

      let conversationId =
        typeof body?.conversation_id === 'string' && body.conversation_id.trim()
          ? body.conversation_id.trim()
          : null
      let k =
        typeof body?.k === 'number' && Number.isFinite(body.k)
          ? Math.trunc(body.k)
          : undefined

      try {
        return await proxyKnowledgeChatStream(auth, params.knowledgeId, {
          query,
          conversation_id: conversationId,
          k,
        }, request.signal)
      } catch (error) {
        let message =
          error instanceof Error
            ? error.message
            : 'Could not reach the chat API.'
        return Response.json({ error: message, code: 'http_error' }, { status: 502 })
      }
    },
  },
})

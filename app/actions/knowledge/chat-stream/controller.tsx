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
        attachment_file_ids?: unknown
        model?: unknown
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
      let model =
        typeof body?.model === 'string' && body.model.trim()
          ? body.model.trim()
          : undefined

      // Untrusted client list — backend ownership-filters; we only normalize shape.
      let attachmentFileIds: string[] | undefined
      if (Array.isArray(body?.attachment_file_ids)) {
        let ids = body.attachment_file_ids
          .filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
          .map((id) => id.trim())
          .slice(0, 12)
        if (ids.length > 0) attachmentFileIds = ids
      }

      try {
        return await proxyKnowledgeChatStream(auth, params.knowledgeId, {
          query,
          conversation_id: conversationId,
          k,
          attachment_file_ids: attachmentFileIds,
          model,
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

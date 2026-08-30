/**
 * Knowledge BFF — create + addFile for implicit per-chat KB only.
 * GET /knowledge and /knowledge/:id redirect home (management UI removed).
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'

import { addKnowledgeFile, createKnowledge } from '../../data/knowledge.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

async function createFromJson(auth: string, request: Request): Promise<Response> {
  let body = (await readJsonBody(request)) as {
    name?: unknown
    description?: unknown
    meta?: unknown
  } | null
  let name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) {
    return Response.json({ error: 'Enter a name for the knowledge base.' }, { status: 400 })
  }
  let description =
    typeof body?.description === 'string' ? body.description.trim() || null : null
  let meta =
    body?.meta && typeof body.meta === 'object' && !Array.isArray(body.meta)
      ? (body.meta as Record<string, unknown>)
      : null

  try {
    let knowledge = await createKnowledge(auth, { name, description, meta })
    return Response.json({ knowledge }, { status: 201 })
  } catch (error) {
    let message =
      error instanceof Error ? error.message : 'Could not create knowledge base.'
    return Response.json({ error: message }, { status: 502 })
  }
}

export default createController(routes.knowledge, {
  actions: {
    async index() {
      return redirect(routes.home.href(), 303)
    },

    async show() {
      return redirect(routes.home.href(), 303)
    },

    async create({ session, request }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      let contentType = request.headers.get('Content-Type') ?? ''
      if (!contentType.includes('application/json')) {
        return Response.json(
          { error: 'Knowledge bases are created automatically when you attach files.' },
          { status: 400 },
        )
      }
      return createFromJson(auth, request)
    },

    async addFile({ session, params, request }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      let body = (await readJsonBody(request)) as { file_id?: unknown } | null
      let fileId = typeof body?.file_id === 'string' ? body.file_id.trim() : ''
      if (!fileId) {
        return Response.json({ error: 'Choose a file to add.' }, { status: 400 })
      }

      try {
        let knowledge = await addKnowledgeFile(auth, params.knowledgeId, fileId)
        return Response.json({ knowledge })
      } catch (error) {
        let message =
          error instanceof Error ? error.message : 'Could not add file to knowledge base.'
        let status = /already/i.test(message) ? 409 : 502
        return Response.json({ error: message }, { status })
      }
    },
  },
})

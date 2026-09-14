/**
 * GET /models — authenticated proxy to FastAPI model catalog.
 */
import { createController } from 'remix/router'

import { listModels } from '../../data/chat.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'

export default createController(routes.models, {
  actions: {
    async list({ session, request }) {
      let auth = requireAuthFromSession(session, routes.home.href())
      if (auth instanceof Response) return auth

      let url = new URL(request.url)
      let q = url.searchParams.get('q')
      let offsetRaw = url.searchParams.get('offset')
      let limitRaw = url.searchParams.get('limit')
      let offset =
        offsetRaw != null && offsetRaw !== '' && Number.isFinite(Number(offsetRaw))
          ? Math.max(0, Math.trunc(Number(offsetRaw)))
          : 0
      let limit =
        limitRaw != null && limitRaw !== '' && Number.isFinite(Number(limitRaw))
          ? Math.trunc(Number(limitRaw))
          : 50

      try {
        let page = await listModels(auth, { q, offset, limit })
        return Response.json(page)
      } catch (error) {
        let message =
          error instanceof Error ? error.message : 'Could not load models.'
        let status =
          typeof (error as { status?: unknown }).status === 'number'
            ? (error as { status: number }).status
            : 502
        return Response.json({ error: message }, { status })
      }
    },
  },
})

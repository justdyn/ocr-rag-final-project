/**
 * Settings Account — thin JSON proxy to FastAPI /api/profile (PATCH name).
 * Controllers stay thin: parse, call services, return Response (styleguide §2.4).
 */
import { createController } from 'remix/router'

import { updateProfileName } from '../../data/auth.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'

type AccountPutRequest = {
  name: string
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export default createController(routes.settings.account, {
  actions: {
    async post({ request, session }) {
      let auth = requireAuthFromSession(session)
      if (auth instanceof Response) return auth

      let body = (await readJsonBody(request)) as AccountPutRequest | null
      if (!body || !body.name?.trim()) {
        return Response.json({ error: 'Name is required' }, { status: 400 })
      }

      let result = await updateProfileName(auth, body.name.trim())
      if (!result.ok) {
        return Response.json(
          { error: result.error.detail },
          { status: result.error.status },
        )
      }
      return Response.json({ name: result.data.name })
    },
  },
})

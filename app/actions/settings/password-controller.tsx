/**
 * Settings Password — thin JSON proxy to FastAPI /api/profile/password (POST change).
 * Controllers stay thin: parse, call services, return Response (styleguide §2.4).
 */
import { createController } from 'remix/router'

import { changePassword } from '../../data/auth.ts'
import { requireAuthFromSession } from '../../middleware/require-auth.ts'
import { routes } from '../../routes.ts'

type PasswordPostRequest = {
  current_password: string
  new_password: string
}

async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json()
  } catch {
    return null
  }
}

export default createController(routes.settings.password, {
  actions: {
    async post({ request, session }) {
      let auth = requireAuthFromSession(session)
      if (auth instanceof Response) return auth

      let body = (await readJsonBody(request)) as PasswordPostRequest | null
      if (!body || !body.current_password || !body.new_password) {
        return Response.json(
          { error: 'Current password and new password are required' },
          { status: 400 },
        )
      }
      if (body.new_password.length < 8 || body.new_password.length > 128) {
        return Response.json(
          { error: 'New password must be 8-128 characters' },
          { status: 400 },
        )
      }

      let result = await changePassword(
        auth,
        body.current_password,
        body.new_password,
      )
      if (!result.ok) {
        return Response.json(
          { error: result.error.detail },
          { status: result.error.status },
        )
      }
      return Response.json({ ok: true })
    },
  },
})

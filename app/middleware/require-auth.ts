/**
 * Auth guard for protected loaders/actions (later Phase 7 steps).
 * Middleware-owned: app-wide route-boundary concern (styleguide §2.1).
 *
 * Does not verify JWT signature — FastAPI does that on protected API calls / `/api/auth/me`.
 * This helper only ensures a token is present in the BFF session cookie.
 */
import { redirect } from 'remix/response/redirect'
import type { Session } from 'remix/session'

import { loginHref } from '../utils/login-href.ts'
import { getAccessToken, readSessionFromRequest } from './session.ts'

function loginRedirect(returnTo?: string): Response {
  return redirect(loginHref({ returnTo }), 303)
}

/**
 * Given a Remix Request, read the session cookie and return the JWT,
 * or a redirect Response to `/login` when missing.
 *
 * Usage in protected actions:
 *   let auth = await requireAuth(request)
 *   if (auth instanceof Response) return auth
 *   // auth is the Bearer token string
 *
 * Note: returns (does not throw) a redirect Response — the Node server adapter
 * in `server.ts` treats thrown non-abort errors as 500s, and this step cannot
 * modify root server files.
 */
export async function requireAuth(request: Request): Promise<string | Response> {
  let session = await readSessionFromRequest(request)
  return requireAuthFromSession(session, new URL(request.url).pathname)
}

/** Same guard when the session middleware has already loaded `context.session`. */
export function requireAuthFromSession(
  session: Session,
  returnTo?: string,
): string | Response {
  let token = getAccessToken(session)
  if (!token) return loginRedirect(returnTo)
  return token
}

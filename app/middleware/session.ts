/**
 * BFF session cookie — stores the FastAPI JWT inside a signed httpOnly cookie.
 * Lives in middleware/ because session lifecycle is an app-wide request concern (styleguide §2.1).
 */
import { createCookie } from 'remix/cookie'
import { createCookieSessionStorage } from 'remix/session-storage/cookie'
import type { Session } from 'remix/session'

/** Session data key for the backend JWT. Never render this value into HTML. */
export const ACCESS_TOKEN_KEY = 'accessToken'

/** Align cookie lifetime with backend JWT_EXPIRE_MINUTES (default 7 days). */
export const JWT_EXPIRE_MINUTES = Number.parseInt(
  process.env.JWT_EXPIRE_MINUTES ?? String(60 * 24 * 7),
  10,
)

const SESSION_MAX_AGE_SECONDS = JWT_EXPIRE_MINUTES * 60

function resolveSessionSecret(): string {
  let secret = process.env.SESSION_SECRET
  if (secret && secret.length > 0) return secret
  if (process.env.NODE_ENV === 'test') return 'test-only-session-secret'
  if (process.env.NODE_ENV !== 'production') {
    // Dev convenience — production must set SESSION_SECRET.
    return 'dev-only-session-secret-change-me'
  }
  throw new Error('SESSION_SECRET is required in production')
}

/**
 * Cookie flags:
 * - name: `__session` (signed envelope; payload holds accessToken)
 * - httpOnly: true — browser JS cannot read the JWT
 * - sameSite: Lax — CSRF-resistant for top-level navigations
 * - secure: production only
 * - maxAge: JWT_EXPIRE_MINUTES * 60
 */
export const sessionCookie = createCookie('__session', {
  secrets: [resolveSessionSecret()],
  httpOnly: true,
  sameSite: 'Lax',
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_MAX_AGE_SECONDS,
})

export const sessionStorage = createCookieSessionStorage()

export function getAccessToken(session: Session): string | null {
  let value = session.get(ACCESS_TOKEN_KEY)
  return typeof value === 'string' && value.length > 0 ? value : null
}

/** Store JWT after successful login. Regenerates id to mitigate fixation. */
export function setAccessToken(session: Session, token: string): void {
  // Cookie storage cannot delete the prior id — regenerate without delete=true.
  session.regenerateId()
  session.set(ACCESS_TOKEN_KEY, token)
}

/** Clear JWT / destroy session on logout. */
export function clearAccessToken(session: Session): void {
  session.unset(ACCESS_TOKEN_KEY)
  session.destroy()
}

/** Read a session from a raw Request cookie header (for helpers outside middleware). */
export async function readSessionFromRequest(request: Request): Promise<Session> {
  let raw = await sessionCookie.parse(request.headers.get('Cookie'))
  return sessionStorage.read(raw)
}

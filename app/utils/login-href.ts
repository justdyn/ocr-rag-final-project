/**
 * Login URL builder — splash is opt-in (`welcome=1` from anonymous `/` only).
 * Sign-in links (register, logout, requireAuth) stay `/login` so the form is visible.
 */
import { routes } from '../routes.ts'
import { safeReturnTo } from './safe-return-to.ts'

export function loginHref(opts?: { returnTo?: string; welcome?: boolean }): string {
  let params = new URLSearchParams()
  if (opts?.welcome) params.set('welcome', '1')
  let returnTo = opts?.returnTo ? safeReturnTo(opts.returnTo, '') : ''
  if (returnTo) params.set('returnTo', returnTo)
  let qs = params.toString()
  return qs ? `${routes.login.index.href()}?${qs}` : routes.login.index.href()
}

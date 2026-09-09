/**
 * Login route controller — parse form → call FastAPI login → set httpOnly session JWT → redirect.
 * Controllers stay thin: parse, call data/UI, return Response (styleguide §2.4).
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { email as emailCheck, minLength } from 'remix/data-schema/checks'

import { loginUser } from '../../data/auth.ts'
import { getAccessToken, setAccessToken } from '../../middleware/session.ts'
import { routes } from '../../routes.ts'
import { safeReturnTo } from '../../utils/safe-return-to.ts'
import { LoginPage } from './login-page.tsx'

let loginSchema = f.object({
  email: f.field(s.string().pipe(emailCheck())),
  password: f.field(s.string().pipe(minLength(1))),
  returnTo: f.field(s.optional(s.string())),
})

export default createController(routes.login, {
  actions: {
    async index({ request, session, render }) {
      if (getAccessToken(session)) {
        return redirect(routes.home.href(), 303)
      }

      let url = new URL(request.url)
      let returnTo = safeReturnTo(url.searchParams.get('returnTo'), '')
      let flashError = session.get('flashError')
      let error = typeof flashError === 'string' ? flashError : undefined
      // Splash is only for anonymous `/` → `?welcome=1`. Direct /login (register Sign in,
      // logout, requireAuth) must show the form, not the overlay.
      let showOnboarding =
        url.searchParams.get('welcome') === '1' && !error && !returnTo

      return render(
        <LoginPage
          error={error}
          returnTo={returnTo || undefined}
          showOnboarding={showOnboarding}
        />,
      )
    },

    async action({ get, session, render, request }) {
      let formData = get(FormData)
      let parsed = s.parseSafe(loginSchema, formData)
      if (!parsed.success) {
        return render(
          <LoginPage error="Enter a valid email and password." />,
          { status: 400 },
        )
      }

      let { email, password, returnTo: rawReturnTo } = parsed.value
      let result = await loginUser({ email, password })

      if (!result.ok) {
        let message =
          result.error.status === 403
            ? 'This account is inactive.'
            : 'Invalid email or password.'
        return render(
          <LoginPage
            error={message}
            email={email}
            returnTo={safeReturnTo(rawReturnTo, '') || undefined}
          />,
          { status: result.error.status === 403 ? 403 : 401 },
        )
      }

      // JWT stays in the signed httpOnly session cookie — never passed to the page.
      setAccessToken(session, result.data.access_token)

      let url = new URL(request.url)
      let fromQuery = url.searchParams.get('returnTo')
      let destination = safeReturnTo(
        rawReturnTo ?? fromQuery,
        routes.home.href(),
      )
      return redirect(destination, 303)
    },
  },
})

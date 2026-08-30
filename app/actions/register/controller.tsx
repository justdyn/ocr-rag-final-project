/**
 * Register route controller — parse form → FastAPI register → login for JWT → session cookie.
 */
import { createController } from 'remix/router'
import { redirect } from 'remix/response/redirect'
import * as s from 'remix/data-schema'
import * as f from 'remix/data-schema/form-data'
import { email as emailCheck, maxLength, minLength } from 'remix/data-schema/checks'

import { loginUser, registerUser } from '../../data/auth.ts'
import { getAccessToken, setAccessToken } from '../../middleware/session.ts'
import { routes } from '../../routes.ts'
import { RegisterPage } from './register-page.tsx'

let registerSchema = f.object({
  name: f.field(s.string().pipe(minLength(1), maxLength(255))),
  email: f.field(s.string().pipe(emailCheck())),
  password: f.field(s.string().pipe(minLength(8), maxLength(128))),
})

export default createController(routes.register, {
  actions: {
    async index({ session, render }) {
      if (getAccessToken(session)) {
        return redirect(routes.home.href(), 303)
      }
      return render(<RegisterPage />)
    },

    async action({ get, session, render }) {
      let formData = get(FormData)
      let parsed = s.parseSafe(registerSchema, formData)
      if (!parsed.success) {
        let fieldErrors: {
          email?: string
          password?: string
          name?: string
        } = {}
        for (let issue of parsed.issues) {
          let key = issue.path?.[0]
          if (key === 'email' || key === 'password' || key === 'name') {
            fieldErrors[key] = issue.message
          }
        }
        let emailValue = formData.get('email')
        let nameValue = formData.get('name')
        return render(
          <RegisterPage
            error="Please fix the highlighted fields."
            email={typeof emailValue === 'string' ? emailValue : ''}
            name={typeof nameValue === 'string' ? nameValue : ''}
            fieldErrors={fieldErrors}
          />,
          { status: 400 },
        )
      }

      let { email, password, name } = parsed.value
      let registered = await registerUser({ email, password, name })

      if (!registered.ok) {
        let message =
          registered.error.status === 409
            ? 'An account with this email already exists.'
            : registered.error.detail || 'Registration failed.'
        return render(
          <RegisterPage error={message} email={email} name={name} />,
          { status: registered.error.status === 409 ? 409 : 400 },
        )
      }

      // Backend register returns user only — exchange credentials for JWT, then cookie it.
      let loggedIn = await loginUser({ email, password })
      if (!loggedIn.ok) {
        session.flash('flashError', 'Account created. Please sign in.')
        return redirect(routes.login.index.href(), 303)
      }

      setAccessToken(session, loggedIn.data.access_token)
      return redirect(routes.home.href(), 303)
    },
  },
})

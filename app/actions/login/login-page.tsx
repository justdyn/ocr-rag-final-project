/**
 * Login page UI — route-local under actions/login (single-route owner, styleguide §2.1).
 */
import type { Handle } from 'remix/ui'

import { routes } from '../../routes.ts'
import { AuthShell, authSubmitClassName } from '../../ui/auth-shell.tsx'
import { Document } from '../../ui/document.tsx'
import { FormField } from '../../ui/form-field.tsx'

export type LoginPageProps = {
  error?: string
  email?: string
  returnTo?: string
}

export function LoginPage(handle: Handle<LoginPageProps>) {
  return () => {
    let { error, email = '', returnTo } = handle.props
    let action = routes.login.action.href()

    return (
      <Document title="Sign in · DocIntel">
        <AuthShell
          title="Sign in"
          subtitle="Welcome back! Please enter your details."
          error={error}
          footer={
            <>
              No account?{' '}
              <a
                href={routes.register.index.href()}
                className="font-medium text-accent underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                Create one
              </a>
            </>
          }
        >
          <form method="post" action={action} className="flex flex-col gap-4">
            {returnTo ? <input type="hidden" name="returnTo" value={returnTo} /> : null}
            <FormField
              id="email"
              name="email"
              label="Email"
              type="email"
              autocomplete="email"
              defaultValue={email}
            />
            <FormField
              id="password"
              name="password"
              label="Password"
              type="password"
              autocomplete="current-password"
            />
            <button type="submit" className={authSubmitClassName}>
              Sign in
            </button>
          </form>
        </AuthShell>
      </Document>
    )
  }
}

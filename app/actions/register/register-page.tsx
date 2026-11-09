/**
 * Register page UI — route-local under actions/register (single-route owner).
 */
import type { Handle } from 'remix/ui'

import { routes } from '../../routes.ts'
import { loginHref } from '../../utils/login-href.ts'
import { AuthShell, authSubmitClassName } from '../../ui/auth-shell.tsx'
import { Document } from '../../ui/document.tsx'
import { FormField } from '../../ui/form-field.tsx'

export type RegisterPageProps = {
  error?: string
  email?: string
  name?: string
  fieldErrors?: {
    email?: string
    password?: string
    name?: string
  }
}

export function RegisterPage(handle: Handle<RegisterPageProps>) {
  return () => {
    let { error, email = '', name = '', fieldErrors } = handle.props
    let action = routes.register.action.href()

    return (
      <Document title="Create account · Tensho">
        <AuthShell
          title="Create account"
          subtitle="Create an account to get started."
          error={error}
          footer={
            <>
              Already registered?{' '}
              <a
                href={loginHref()}
                className="font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
              >
                Sign in
              </a>
            </>
          }
        >
          <form method="post" action={action} className="flex flex-col gap-4">
            <FormField
              id="name"
              name="name"
              label="Name"
              type="text"
              autocomplete="name"
              defaultValue={name}
              error={fieldErrors?.name}
            />
            <FormField
              id="email"
              name="email"
              label="Email"
              type="email"
              autocomplete="email"
              defaultValue={email}
              error={fieldErrors?.email}
            />
            <FormField
              id="password"
              name="password"
              label="Password"
              type="password"
              autocomplete="new-password"
              error={fieldErrors?.password}
              hint="At least 8 characters."
            />
            <button type="submit" className={authSubmitClassName}>
              Create account
            </button>
          </form>
        </AuthShell>
      </Document>
    )
  }
}

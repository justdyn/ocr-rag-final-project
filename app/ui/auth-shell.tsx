/**
 * Shared auth page chrome (brand, title, card panel, footer link).
 * Extracted because /login and /register share the same visual shell (styleguide §2.5).
 */
import type { Handle, RemixNode } from 'remix/ui'

export type AuthShellProps = {
  title: string
  subtitle: string
  children?: RemixNode
  footer?: RemixNode
  error?: string
}

export function AuthShell(handle: Handle<AuthShellProps>) {
  return () => {
    let { title, subtitle, children, footer, error } = handle.props

    return (
      <main className="flex min-h-screen items-center justify-center bg-surface px-4 py-12">
        <div className="w-full max-w-md">
          <p className="mb-8 text-center font-display text-display font-semibold tracking-tight text-foreground">
            DocIntel
          </p>
          <section>
            <header className="mb-8 flex flex-col gap-2 text-center">
              <h1 className="text-2xl font-semibold text-foreground">{title}</h1>
              <p className="text-sm text-muted">{subtitle}</p>
            </header>

            {error ? (
              <div
                className="mb-5 rounded-full border border-border bg-surface-muted px-4 py-2.5 text-center text-sm text-destructive"
                role="alert"
              >
                {error}
              </div>
            ) : null}

            {children}

            {footer ? <div className="mt-8 text-center text-sm text-muted">{footer}</div> : null}
          </section>
        </div>
      </main>
    )
  }
}

/** Shared primary submit button classes for auth forms. */
export const authSubmitClassName =
  'inline-flex h-[52px] w-full items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-surface transition-opacity duration-200 ease-out-premium hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60'

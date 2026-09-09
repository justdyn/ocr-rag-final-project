/**
 * Shared labeled text/password input for auth forms.
 * Promoted to app/ui/ because login + register both need the same field chrome (styleguide §2.5).
 */
import type { Handle, RemixNode } from 'remix/ui'

export type FormFieldProps = {
  id: string
  name: string
  label: string
  type?: 'text' | 'email' | 'password'
  autocomplete?: string
  required?: boolean
  defaultValue?: string
  error?: string
  hint?: RemixNode
}

export function FormField(handle: Handle<FormFieldProps>) {
  return () => {
    let {
      id,
      name,
      label,
      type = 'text',
      autocomplete,
      required = true,
      defaultValue = '',
      error,
      hint,
    } = handle.props

    let describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined
    let shared = {
      id,
      name,
      autoComplete: autocomplete,
      required,
      // Bug fix: use defaultValue (uncontrolled). `value` is controlled in remix/ui and
      // would reset on re-render with no onChange/update path.
      defaultValue,
      placeholder: ' ',
      'aria-invalid': error ? ('true' as const) : undefined,
      'aria-describedby': describedBy,
      className:
        'peer h-[52px] w-full rounded-full border border-border bg-surface px-5 pt-4 text-base text-foreground outline-none transition-[box-shadow,border-color] duration-200 ease-out-premium placeholder:text-transparent focus-visible:border-foreground focus-visible:ring-2 focus-visible:ring-foreground/30',
    }

    return (
      <div className="flex flex-col gap-2">
        <div className="relative">
          {type === 'email' ? (
            <input type="email" {...shared} />
          ) : type === 'password' ? (
            <input type="password" {...shared} />
          ) : (
            <input type="text" {...shared} />
          )}
          <label
            htmlFor={id}
            className="pointer-events-none absolute left-5 top-2 origin-left text-xs font-medium text-muted transition-[top,font-size,transform,color] duration-200 ease-out-premium peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:text-muted peer-focus:top-2 peer-focus:translate-y-0 peer-focus:text-xs peer-focus:text-subtle peer-not-placeholder-shown:top-2 peer-not-placeholder-shown:translate-y-0 peer-not-placeholder-shown:text-xs"
          >
            {label}
          </label>
        </div>
        {error ? (
          <p id={`${id}-error`} className="px-1 text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        {!error && hint ? (
          <p id={`${id}-hint`} className="px-1 text-sm text-muted">
            {hint}
          </p>
        ) : null}
      </div>
    )
  }
}

/**
 * Shared labeled text/password input.
 * variant="auth" (default): auth floating-label chrome (styleguide §2.5) — login + register.
 * variant="shell": §3.5 settings input chrome — Settings modal fields + search.
 */
import { on } from 'remix/ui'
import type { Handle, RemixNode } from 'remix/ui'

import {
  settingsModalLabelStyle,
  settingsModalInputStyle,
  settingsModalRowStyle,
  settingsModalRowLabelStyle,
} from './styles/chat-shell/sidebar-styles.ts'

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
  variant?: 'auth' | 'shell'
  // shell variant: controlled value + input handler (auth stays uncontrolled defaultValue)
  value?: string
  onInput?: (event: Event) => void
  disabled?: boolean
  minLength?: number
  placeholder?: string
  // shell only: 'row' = label-left / control-right settings row (§3.5 scope 2)
  layout?: 'stack' | 'row'
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
      variant = 'auth',
      value,
      onInput,
      disabled,
      minLength,
      placeholder,
      layout = 'stack',
    } = handle.props

    if (variant === 'shell') {
      // Controlled only when `value` is passed (Settings panes). Without `value`,
      // uncontrolled defaultValue (mirrors auth variant) — no update path needed.
      let controlled = value !== undefined
      let shellInputProps = {
        id,
        name,
        ...(controlled ? { value } : { defaultValue }),
        placeholder: placeholder ?? '',
        autoComplete: autocomplete,
        minLength,
        required,
        disabled,
        'aria-invalid': error ? ('true' as const) : undefined,
        'aria-describedby': error ? `${id}-error` : undefined,
      }
      let inputMix = controlled && onInput
        ? [settingsModalInputStyle, on<HTMLInputElement, 'input'>('input', onInput)]
        : settingsModalInputStyle
      let shellInput =
        type === 'email' ? (
          <input type="email" {...shellInputProps} mix={inputMix} />
        ) : type === 'password' ? (
          <input type="password" {...shellInputProps} mix={inputMix} />
        ) : (
          <input type="text" {...shellInputProps} mix={inputMix} />
        )
      if (layout === 'row') {
        return (
          <div data-form-field="shell" mix={settingsModalRowStyle}>
            <label htmlFor={id} mix={settingsModalRowLabelStyle}>
              {label}
            </label>
            {/* settingsModalInputStyle is width:100% — host keeps it flex-right in the row */}
            <div style={{ flex: '1 1 auto', maxWidth: '60%', display: 'flex' }}>{shellInput}</div>
            {(error ?? hint) && (
              <div style={{ flexBasis: '100%' }}>
                {error ? (
                  <span
                    id={`${id}-error`}
                    role="alert"
                    style={{ fontSize: '12px', lineHeight: '16px', color: 'rgba(220, 38, 38, 0.9)' }}
                  >
                    {error}
                  </span>
                ) : (
                  hint ?? null
                )}
              </div>
            )}
          </div>
        )
      }
      return (
        <div data-form-field="shell">
          <label mix={settingsModalLabelStyle}>
            <span>{label}</span>
            {shellInput}
            {error ? (
              <span
                id={`${id}-error`}
                role="alert"
                style={{ fontSize: '12px', lineHeight: '16px', color: 'rgba(220, 38, 38, 0.9)' }}
              >
                {error}
              </span>
            ) : (
              hint ?? null
            )}
          </label>
        </div>
      )
    }

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
      <div className="flex flex-col gap-2" data-form-field="auth">
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
/**
 * Settings → Password pane (§3.5). Presentational: state + save live in settings-modal host.
 * Saves via routes.settings.password; new password min length 8 enforced client + server.
 */
import { on } from 'remix/ui'
import type { Handle } from 'remix/ui'

import { FormField } from './form-field.tsx'
import {
  settingsModalSectionTitleStyle,
  settingsModalSectionStyle,
  settingsModalAlertErrorStyle,
  settingsModalAlertSuccessStyle,
  settingsModalButtonStyle,
} from './styles/chat-shell/sidebar-styles.ts'

export interface PasswordPaneProps {
  current: string
  next: string
  saving: boolean
  error: string | null
  success: string | null
  onCurrentInput: (event: Event) => void
  onNextInput: (event: Event) => void
  onSave: () => void
}

export function PasswordPane(handle: Handle<PasswordPaneProps>) {
  return () => {
    let { current, next, saving, error, success, onCurrentInput, onNextInput, onSave } =
      handle.props
    return (
      <div>
        <h3 mix={settingsModalSectionTitleStyle}>Password</h3>
        <div mix={settingsModalSectionStyle}>
          <FormField
            id="settings-current-password"
            name="current_password"
            label="Current password"
            type="password"
            variant="shell"
            layout="row"
            autocomplete="current-password"
            value={current}
            placeholder="Enter current password"
            disabled={saving}
            onInput={onCurrentInput}
          />
          <FormField
            id="settings-new-password"
            name="new_password"
            label="New password"
            type="password"
            variant="shell"
            layout="row"
            autocomplete="new-password"
            value={next}
            placeholder="Enter new password (min 8 characters)"
            minLength={8}
            disabled={saving}
            onInput={onNextInput}
            hint={<span>Minimum 8 characters</span>}
          />
          {error && (
            <div role="alert" mix={settingsModalAlertErrorStyle}>
              {error}
            </div>
          )}
          {success && <div mix={settingsModalAlertSuccessStyle}>{success}</div>}
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button
              type="button"
              mix={[settingsModalButtonStyle, on('click', onSave)]}
              disabled={saving}
            >
              {saving ? 'Updating...' : 'Update'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
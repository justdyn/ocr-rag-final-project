/**
 * Settings → Account pane (§3.5). Presentational: state + save live in settings-modal host.
 * Email is read-only; display name saves via routes.settings.account.
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

export interface AccountPaneProps {
  userEmail: string
  name: string
  saving: boolean
  error: string | null
  success: string | null
  onNameInput: (event: Event) => void
  onSave: () => void
}

export function AccountPane(handle: Handle<AccountPaneProps>) {
  return () => {
    let { userEmail, name, saving, error, success, onNameInput, onSave } = handle.props
    return (
      <div>
        <h3 mix={settingsModalSectionTitleStyle}>Account</h3>
        <div mix={settingsModalSectionStyle}>
          <FormField
            id="settings-email"
            name="email"
            label="Email"
            type="email"
            variant="shell"
            layout="row"
            value={userEmail}
            disabled
            required={false}
            hint={<span>Email cannot be changed</span>}
          />
          <FormField
            id="settings-name"
            name="name"
            label="Display name"
            variant="shell"
            layout="row"
            value={name}
            placeholder="Your name"
            disabled={saving}
            onInput={onNameInput}
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
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    )
  }
}
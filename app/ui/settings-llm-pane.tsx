/**
 * Settings → LLM / API pane (§3.5, admin-only). Presentational: state + fetches live in
 * settings-modal host. Loads/saves via routes.settings.admin.llmConfig.
 */
import { on } from 'remix/ui'
import type { Handle } from 'remix/ui'

import { FormField } from './form-field.tsx'
import {
  settingsModalSectionTitleStyle,
  settingsModalSectionStyle,
  settingsModalFieldStyle,
  settingsModalInputHintStyle,
  settingsModalKeyMaskStyle,
  settingsModalAlertErrorStyle,
  settingsModalAlertSuccessStyle,
  settingsModalButtonStyle,
} from './styles/chat-shell/sidebar-styles.ts'

export type LlmConfigFormState = {
  api_key: string
  base_url: string
  model: string
  key_suffix: string | null
  source: 'db' | 'env' | 'none'
  configured: boolean
  saving: boolean
  error: string | null
  success: string | null
}

export interface LlmPaneProps {
  config: LlmConfigFormState
  onApiKeyInput: (event: Event) => void
  onBaseUrlInput: (event: Event) => void
  onModelInput: (event: Event) => void
  onSave: () => void
  onClear: () => void
}

export function LlmPane(handle: Handle<LlmPaneProps>) {
  return () => {
    let { config, onApiKeyInput, onBaseUrlInput, onModelInput, onSave, onClear } = handle.props
    return (
      <div>
        <h3 mix={settingsModalSectionTitleStyle}>LLM / API</h3>
        <div mix={settingsModalSectionStyle}>
          {config.saving ? (
            <div mix={settingsModalFieldStyle}>
              <span mix={settingsModalInputHintStyle}>Loading...</span>
            </div>
          ) : (
            <>
              <FormField
                id="settings-llm-key"
                name="api_key"
                label="API Key"
                type="password"
                variant="shell"
                layout="row"
                autocomplete="off"
                value={config.api_key}
                placeholder={config.key_suffix ? `••••${config.key_suffix}` : 'Enter API key to override'}
                disabled={config.saving}
                onInput={onApiKeyInput}
                hint={
                  <>
                    {config.key_suffix && (
                      <span mix={settingsModalKeyMaskStyle}>
                        Saved as ••••{config.key_suffix} ({config.source})
                      </span>
                    )}
                    <span mix={settingsModalInputHintStyle}>
                      Leave blank to keep current. Clear button removes override.
                    </span>
                  </>
                }
              />
              <FormField
                id="settings-llm-base-url"
                name="base_url"
                label="Base URL"
                type="text"
                variant="shell"
                layout="row"
                value={config.base_url}
                placeholder="https://api.openai.com/v1"
                disabled={config.saving}
                onInput={onBaseUrlInput}
                hint={
                  <span mix={settingsModalInputHintStyle}>
                    Override default API base URL. Leave blank to keep current.
                  </span>
                }
              />
              <FormField
                id="settings-llm-model"
                name="model"
                label="Default Model"
                variant="shell"
                layout="row"
                value={config.model}
                placeholder="gpt-4o-mini"
                disabled={config.saving}
                onInput={onModelInput}
                hint={
                  <span mix={settingsModalInputHintStyle}>
                    Model used when none specified in chat. Leave blank to keep current.
                  </span>
                }
              />
              {config.error && (
                <div role="alert" mix={settingsModalAlertErrorStyle}>
                  {config.error}
                </div>
              )}
              {config.success && <div mix={settingsModalAlertSuccessStyle}>{config.success}</div>}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  mix={[settingsModalButtonStyle, on('click', onSave)]}
                  disabled={config.saving}
                >
                  {config.saving ? 'Saving...' : 'Save'}
                </button>
                {config.configured && (
                  <button
                    type="button"
                    mix={[settingsModalButtonStyle, on('click', onClear)]}
                    style={{
                      background: 'transparent',
                      borderColor: 'var(--home-border-strong)',
                      color: 'var(--home-fg)',
                    }}
                    disabled={config.saving}
                  >
                    Clear API Key
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    )
  }
}
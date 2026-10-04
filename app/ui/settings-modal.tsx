/**
 * Settings modal — ChatGPT-style chrome (§3.5): debounced local search filter + left nav
 * + pane host. Panes are presentational extracts (account / password / llm); state and
 * fetches live here. Search is a local nav filter (labels + synonyms) — no network call;
 * each tick owns an AbortController, stale ticks dropped. No React hooks / <motion.*>.
 */
import { on, ref, type Handle } from 'remix/ui'

import { routes } from '../routes.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../utils/chat-shell-icons.ts'
import { animateMenuFade } from '../utils/motion.ts'
import { debounce } from '../utils/debounce.ts'
import {
  settingsModalOverlayStyle,
  settingsModalStyle,
  settingsModalBodyStyle,
  settingsModalSrOnlyStyle,
  settingsModalTitleStyle,
  settingsModalSearchStyle,
  settingsModalSearchInputStyle,
  settingsModalCloseStyle,
  settingsModalNavStyle,
  settingsModalNavItemsStyle,
  settingsModalNavItemStyle,
  settingsModalNavItemActiveStyle,
  settingsModalContentStyle,
  settingsModalInputHintStyle,
} from './styles/chat-shell/sidebar-styles.ts'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'
import { AccountPane } from './settings-account-pane.tsx'
import { PasswordPane } from './settings-password-pane.tsx'
import { LlmPane, type LlmConfigFormState } from './settings-llm-pane.tsx'

export interface SettingsModalProps {
  userRole: 'admin' | 'user'
  userName: string
  userEmail: string
  onClose: () => void
}

type LlmConfigResponse = {
  configured: boolean
  key_suffix: string | null
  base_url: string | null
  default_model: string | null
  source: 'db' | 'env'
  updated_at: number | null
}

type ActivePane = 'account' | 'password' | 'llm'

type NavItem = {
  id: ActivePane
  label: string
  icon: 'profile' | 'key' | 'sparkles'
  synonyms: string[]
  adminOnly?: boolean
}

const NAV_ITEMS: NavItem[] = [
  { id: 'account', label: 'Account', icon: 'profile', synonyms: ['profile', 'email', 'name'] },
  { id: 'password', label: 'Password', icon: 'key', synonyms: ['pass', 'security'] },
  {
    id: 'llm',
    label: 'LLM / API',
    icon: 'sparkles',
    synonyms: ['api', 'key', 'model', 'endpoint', 'openai'],
    adminOnly: true,
  },
]

const SEARCH_DEBOUNCE_MS = 200
const JSON_HEADERS = { 'Content-Type': 'application/json' }

export function SettingsModal(handle: Handle<SettingsModalProps>) {
  let isAdmin = handle.props.userRole === 'admin'
  let activePane: ActivePane = 'account'
  let llmConfig: LlmConfigFormState = {
    api_key: '',
    base_url: '',
    model: '',
    key_suffix: null,
    source: 'none',
    configured: false,
    saving: false,
    error: null,
    success: null,
  }
  let accountForm = {
    name: handle.props.userName,
    saving: false,
    error: null as string | null,
    success: null as string | null,
  }
  let passwordForm = {
    current: '',
    next: '',
    saving: false,
    error: null as string | null,
    success: null as string | null,
  }
  let modalEl: HTMLElement | null = null
  let overlayEl: HTMLElement | null = null
  let focusableEls: HTMLElement[] = []
  let lastFocused: HTMLElement | null = null
  // Local search filter
  let searchValue = ''
  let visibleQuery = ''
  let searchAbort: AbortController | null = null

  function visibleNavItems(): NavItem[] {
    return NAV_ITEMS.filter(
      (item) =>
        (!item.adminOnly || isAdmin) &&
        (visibleQuery === '' ||
          item.label.toLowerCase().includes(visibleQuery) ||
          item.synonyms.some((s) => s.includes(visibleQuery))),
    )
  }

  async function applySearch(query: string, signal: AbortSignal) {
    // Yield one microtask so a close/abort between tick and apply drops the stale tick.
    await Promise.resolve()
    if (signal.aborted) return
    visibleQuery = query
    let items = visibleNavItems()
    if (items.length > 0 && !items.some((item) => item.id === activePane)) {
      activePane = items[0].id
    }
    handle.update()
    handle.queueTask(updateFocusable)
  }

  let searchDebounce = debounce((query: string) => {
    searchAbort?.abort()
    let controller = new AbortController()
    searchAbort = controller
    void applySearch(query.trim().toLowerCase(), controller.signal)
  }, SEARCH_DEBOUNCE_MS)

  function onSearchInput(event: Event) {
    searchValue = (event.target as HTMLInputElement).value
    searchDebounce(searchValue)
    handle.update()
  }

  // Focus trap + Escape handled in keydown
  function trapFocus(event: KeyboardEvent) {
    if (event.key !== 'Tab' || focusableEls.length === 0) return
    let first = focusableEls[0]
    let last = focusableEls[focusableEls.length - 1]
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault()
      first.focus()
    }
  }

  function updateFocusable() {
    if (!modalEl) return
    let nodes = modalEl.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    )
    focusableEls = Array.from(nodes).filter(
      (el): el is HTMLElement =>
        !(el as HTMLButtonElement | HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled &&
        el.offsetParent !== null,
    )
  }

  function applyLlmResponse(data: LlmConfigResponse) {
    llmConfig.configured = data.configured
    llmConfig.key_suffix = data.key_suffix
    llmConfig.base_url = data.base_url ?? ''
    llmConfig.model = data.default_model ?? ''
  }

  async function loadLlmConfig() {
    llmConfig.saving = true
    llmConfig.error = null
    handle.update()
    try {
      let response = await fetch(routes.settings.admin.llmConfig.get.href(), { method: 'GET', credentials: 'same-origin' })
      if (!response.ok) throw new Error('Failed to load')
      let data = (await response.json()) as LlmConfigResponse
      applyLlmResponse(data)
      llmConfig.source = data.configured ? data.source : 'none'
    } catch (e) {
      llmConfig.error = 'Could not load LLM config'
    } finally {
      llmConfig.saving = false
      handle.update()
      handle.queueTask(updateFocusable)
    }
  }

  async function saveLlmConfig() {
    llmConfig.saving = true
    llmConfig.error = null
    llmConfig.success = null
    handle.update()
    try {
      let payload: { api_key?: string; base_url?: string; model?: string } = {}
      // Only send fields that changed; omit field = leave unchanged; empty string = clear
      if (llmConfig.api_key !== '') payload.api_key = llmConfig.api_key
      if (llmConfig.base_url !== '') payload.base_url = llmConfig.base_url
      if (llmConfig.model !== '') payload.model = llmConfig.model

      let response = await fetch(routes.settings.admin.llmConfig.put.href(), { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify(payload), credentials: 'same-origin' })
      if (!response.ok) {
        let err = await response.json().catch(() => ({}))
        throw new Error(err.detail ?? err.error ?? 'Save failed')
      }
      let data = (await response.json()) as LlmConfigResponse
      applyLlmResponse(data)
      llmConfig.source = 'db'
      llmConfig.api_key = '' // Clear input after save
      llmConfig.success = 'Saved'
    } catch (e) {
      llmConfig.error = e instanceof Error ? e.message : 'Save failed'
    } finally {
      llmConfig.saving = false
      handle.update()
    }
  }

  async function clearLlmKey() {
    llmConfig.saving = true
    llmConfig.error = null
    llmConfig.success = null
    handle.update()
    try {
      // Explicitly send empty string to clear the override
      let response = await fetch(routes.settings.admin.llmConfig.put.href(), { method: 'PUT', headers: JSON_HEADERS, body: JSON.stringify({ api_key: '' }), credentials: 'same-origin' })
      if (!response.ok) {
        let err = await response.json().catch(() => ({}))
        throw new Error(err.detail ?? err.error ?? 'Clear failed')
      }
      let data = (await response.json()) as LlmConfigResponse
      applyLlmResponse(data)
      llmConfig.source = data.configured ? data.source : 'none'
      llmConfig.api_key = ''
      llmConfig.success = 'API key cleared'
    } catch (e) {
      llmConfig.error = e instanceof Error ? e.message : 'Clear failed'
    } finally {
      llmConfig.saving = false
      handle.update()
    }
  }

  async function saveAccount() {
    accountForm.saving = true
    accountForm.error = null
    accountForm.success = null
    handle.update()
    try {
      let response = await fetch(routes.settings.account.post.href(), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ name: accountForm.name }), credentials: 'same-origin' })
      if (!response.ok) {
        let err = await response.json().catch(() => ({}))
        throw new Error(err.detail ?? err.error ?? 'Save failed')
      }
      accountForm.success = 'Saved'
    } catch (e) {
      accountForm.error = e instanceof Error ? e.message : 'Save failed'
    } finally {
      accountForm.saving = false
      handle.update()
    }
  }

  async function savePassword() {
    passwordForm.saving = true
    passwordForm.error = null
    passwordForm.success = null
    if (passwordForm.next.length < 8) {
      passwordForm.saving = false
      passwordForm.error = 'New password must be at least 8 characters'
      handle.update()
      return
    }
    handle.update()
    try {
      let response = await fetch(routes.settings.password.post.href(), { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ current_password: passwordForm.current, new_password: passwordForm.next }), credentials: 'same-origin' })
      if (!response.ok) {
        let err = await response.json().catch(() => ({}))
        throw new Error(err.detail ?? err.error ?? 'Update failed')
      }
      passwordForm.current = ''
      passwordForm.next = ''
      passwordForm.success = 'Password updated'
    } catch (e) {
      passwordForm.error = e instanceof Error ? e.message : 'Update failed'
    } finally {
      passwordForm.saving = false
      handle.update()
      handle.queueTask(updateFocusable)
    }
  }

  function closeModal() {
    // Sync teardown: queueTask onClose left zombie overlay (blur + pointer-events).
    searchDebounce.cancel()
    searchAbort?.abort()
    overlayEl?.removeAttribute('data-open')
    if (modalEl) {
      animateMenuFade(modalEl, false)
    }
    handle.props.onClose()
  }

  // Setup: focus trap, body scroll lock, load admin config if admin
  if (typeof window !== 'undefined') {
    handle.queueTask(() => {
      lastFocused = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
      if (modalEl) {
        modalEl.focus()
        updateFocusable()
      }
      // Set overlay data-open for visibility/interaction
      if (overlayEl) {
        overlayEl.setAttribute('data-open', 'true')
      }
    })

    let onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeModal()
        return
      }
      trapFocus(event)
    }

    window.addEventListener('keydown', onKeyDown)

    // Load LLM config if admin
    if (isAdmin) {
      handle.queueTask(loadLlmConfig)
    }

    handle.signal.addEventListener('abort', () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      lastFocused?.focus()
    })
  }

  return () => {
    let items = visibleNavItems()

    return (
      <div
        mix={[
          settingsModalOverlayStyle,
          on('click', closeModal),
          ref((node) => {
            overlayEl = node as HTMLElement
          }),
        ]}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-modal-title"
      >
        <div
          mix={[
            settingsModalStyle,
            on('click', (e) => e.stopPropagation()),
            ref((node) => {
              modalEl = node as HTMLElement
              if (modalEl) {
                modalEl.tabIndex = -1
                // Fade in
                animateMenuFade(modalEl, true)
              }
            }),
          ]}
        >
          {/* Scope 2: sr-only; Scope 3 (≤900px): visible top-left, owns aria-labelledby */}
          <h2 id="settings-modal-title" mix={settingsModalTitleStyle}>
            {SHELL_COPY.settings}
          </h2>

          <div mix={settingsModalBodyStyle}>
            {/* Left rail: close + pill search + filtered items (Figma 5:1247 — no top header) */}
            <nav mix={settingsModalNavStyle} aria-label="Settings sections">
              <button
                type="button"
                aria-label="Close settings"
                mix={[settingsModalCloseStyle, on('click', closeModal)]}
              >
                <LucideIcon icon={SHELL_LUCIDE_ICON.close} size={20} strokeWidth={1.75} />
              </button>
              <div mix={settingsModalSearchStyle}>
                <LucideIcon icon={SHELL_LUCIDE_ICON.search} size={16} strokeWidth={1.75} />
                <label htmlFor="settings-search" mix={settingsModalSrOnlyStyle}>
                  Search settings
                </label>
                <input
                  id="settings-search"
                  name="search"
                  type="text"
                  value={searchValue}
                  placeholder="Search settings"
                  mix={[settingsModalSearchInputStyle, on<HTMLInputElement, 'input'>('input', onSearchInput)]}
                />
              </div>
              {/* Desktop: display:contents (children act as direct nav items);
                  Mobile ≤900: horizontal scroll row (CSS flip, one DOM tree) */}
              <div mix={settingsModalNavItemsStyle}>
                {items.map((item) => (
                  <button
                    type="button"
                    role="tab"
                    aria-selected={activePane === item.id}
                    mix={[
                      settingsModalNavItemStyle,
                      activePane === item.id && settingsModalNavItemActiveStyle,
                      on('click', () => {
                        activePane = item.id
                        handle.update()
                        handle.queueTask(updateFocusable)
                      }),
                    ]}
                  >
                    <LucideIcon icon={SHELL_LUCIDE_ICON[item.icon]} size={18} strokeWidth={1.75} />
                    {item.label}
                  </button>
                ))}
              </div>
              {items.length === 0 && (
                <span mix={settingsModalInputHintStyle}>No matching settings</span>
              )}
            </nav>

            {/* Right panel */}
            <div mix={settingsModalContentStyle}>
              {activePane === 'account' && (
                <AccountPane
                  userEmail={handle.props.userEmail}
                  name={accountForm.name}
                  saving={accountForm.saving}
                  error={accountForm.error}
                  success={accountForm.success}
                  onNameInput={(e) => {
                    accountForm.name = (e.target as HTMLInputElement).value
                    handle.update()
                  }}
                  onSave={saveAccount}
                />
              )}
              {activePane === 'password' && (
                <PasswordPane
                  current={passwordForm.current}
                  next={passwordForm.next}
                  saving={passwordForm.saving}
                  error={passwordForm.error}
                  success={passwordForm.success}
                  onCurrentInput={(e) => {
                    passwordForm.current = (e.target as HTMLInputElement).value
                    handle.update()
                  }}
                  onNextInput={(e) => {
                    passwordForm.next = (e.target as HTMLInputElement).value
                    handle.update()
                  }}
                  onSave={savePassword}
                />
              )}
              {activePane === 'llm' && isAdmin && (
                <LlmPane
                  config={llmConfig}
                  onApiKeyInput={(e) => {
                    llmConfig.api_key = (e.target as HTMLInputElement).value
                    handle.update()
                  }}
                  onBaseUrlInput={(e) => {
                    llmConfig.base_url = (e.target as HTMLInputElement).value
                    handle.update()
                  }}
                  onModelInput={(e) => {
                    llmConfig.model = (e.target as HTMLInputElement).value
                    handle.update()
                  }}
                  onSave={saveLlmConfig}
                  onClear={clearLlmKey}
                />
              )}
            </div>
          </div>
        </div>
      </div>
    )
  }
}
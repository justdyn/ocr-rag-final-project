/**
 * Shell top bar — guest login/signup, or KB title. Authenticated sign-out lives in sidebar.
 * Mobile: sidebar-open toggle + title share one flex row (no FAB collision).
 */
import { on, type Handle } from 'remix/ui'

import { routes } from '../../routes.ts'
import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../../utils/chat-shell-icons.ts'
import { dispatchSidebarOpen } from '../../utils/chat-shell-sidebar.ts'
import {
  headerActionsStyle,
  headerLeadingStyle,
  headerSidebarOpenStyle,
  mainHeaderStyle,
  modelNameStyle,
  modelSelectorStyle,
  primaryPillStyle,
  secondaryPillStyle,
} from '../styles/chat-shell/main-styles.ts'
import { LucideIcon } from './lucide-icon.tsx'

export type ShellMainHeaderProps = {
  authenticated?: boolean
  /** Active knowledge base name when in chat scope; falls back to model label. */
  knowledgeName?: string | null
}

export function ShellMainHeader(handle: Handle<ShellMainHeaderProps>) {
  return () => {
    let { authenticated = false, knowledgeName = null } = handle.props
    let title = knowledgeName?.trim() || SHELL_COPY.modelName

    return (
      <header mix={mainHeaderStyle}>
        <div mix={headerLeadingStyle}>
          <button
            type="button"
            aria-label="Open sidebar"
            mix={[
              headerSidebarOpenStyle,
              on('click', () => {
                dispatchSidebarOpen()
              }),
            ]}
          >
            <LucideIcon icon={SHELL_LUCIDE_ICON.sidebarOpen} size={20} strokeWidth={1.75} />
          </button>
          {authenticated ? (
            <span mix={modelSelectorStyle} aria-label="Active knowledge base">
              <span mix={modelNameStyle}>{title}</span>
            </span>
          ) : (
            <button type="button" mix={modelSelectorStyle} aria-haspopup="listbox" disabled>
              <span mix={modelNameStyle}>{SHELL_COPY.modelName}</span>
              <LucideIcon icon={SHELL_LUCIDE_ICON.chevron} size={16} strokeWidth={1.75} />
            </button>
          )}
        </div>
        {!authenticated ? (
          <div mix={headerActionsStyle}>
            <a href={routes.login.index.href()} mix={primaryPillStyle}>
              {SHELL_COPY.login}
            </a>
            <a href={routes.register.index.href()} mix={secondaryPillStyle}>
              {SHELL_COPY.signUp}
            </a>
          </div>
        ) : null}
      </header>
    )
  }
}

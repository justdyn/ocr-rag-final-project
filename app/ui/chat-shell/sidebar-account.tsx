/**
 * Account display helpers + menu body for the chat sidebar (§3.5).
 * Open/close lives in ChatSidebar clientEntry (nested clientEntry does not hydrate).
 * Profile/Help are real links; Settings opens a modal (no route).
 */
import type { RemixNode } from 'remix/ui'
import { on } from 'remix/ui'
import { routes } from '../../routes.ts'
import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../../utils/chat-shell-icons.ts'
import { userInitials } from '../../utils/user-initials.ts'
import {
  accountAvatarStyle,
  accountMenuHeaderStyle,
  accountMenuItemStyle,
  accountMenuLogoutFormStyle,
  accountNameStyle,
} from '../styles/chat-shell/sidebar-styles.ts'
import { LucideIcon } from './lucide-icon.tsx'

export function accountDisplayName(name: string, email: string): string {
  return name.trim() || email.trim() || 'Account'
}

export function accountInitials(name: string, email: string): string {
  return userInitials({ name, email }) || '?'
}

export function accountAvatar(
  name: string,
  email: string,
  profileImageUrl?: string | null,
): RemixNode {
  return profileImageUrl ? (
    <img
      src={routes.profile.avatar.href()}
      alt=""
      aria-hidden="true"
      mix={accountAvatarStyle}
    />
  ) : (
    <span mix={accountAvatarStyle} aria-hidden="true">
      {accountInitials(name, email)}
    </span>
  )
}

/** Menu body — call as a function from ChatSidebar render, not as `<Component />`. */
export function accountMenuBody(
  name: string,
  email: string,
  onSettingsClick: () => void,
  profileImageUrl?: string | null,
) {
  let displayName = accountDisplayName(name, email)
  let initials = accountInitials(name, email)

  return (
    <>
      <div mix={accountMenuHeaderStyle}>
        {accountAvatar(name, email, profileImageUrl)}
        <span mix={accountNameStyle}>{displayName}</span>
      </div>

      <a
        key="profile"
        href={routes.profile.index.href()}
        role="menuitem"
        mix={accountMenuItemStyle}
      >
        <LucideIcon icon={SHELL_LUCIDE_ICON.profile} size={16} strokeWidth={1.75} />
        {SHELL_COPY.profile}
      </a>

      <button
        key="settings"
        type="button"
        role="menuitem"
        mix={[
          accountMenuItemStyle,
          on('click', onSettingsClick),
        ]}
      >
        <LucideIcon icon={SHELL_LUCIDE_ICON.settings} size={16} strokeWidth={1.75} />
        {SHELL_COPY.settings}
      </button>

      <a
        key="help"
        href={routes.help.index.href()}
        role="menuitem"
        mix={accountMenuItemStyle}
      >
        <LucideIcon icon={SHELL_LUCIDE_ICON.help} size={16} strokeWidth={1.75} />
        {SHELL_COPY.help}
      </a>

      <form method="post" action={routes.logout.href()} mix={accountMenuLogoutFormStyle}>
        <button type="submit" role="menuitem" mix={accountMenuItemStyle}>
          <LucideIcon icon={SHELL_LUCIDE_ICON.logOut} size={16} strokeWidth={1.75} />
          {SHELL_COPY.logOut}
        </button>
      </form>
    </>
  )
}

export {
  accountAvatarStyle,
  accountMenuStyle,
  accountNameStyle,
  accountTriggerStyle,
  accountWrapStyle,
} from '../styles/chat-shell/sidebar-styles.ts'

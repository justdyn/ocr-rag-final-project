/**
 * Account display helpers + static menu body for the chat sidebar (§3.5).
 * Open/close lives in ChatSidebar clientEntry (nested clientEntry does not hydrate).
 */
import { routes } from '../../routes.ts'
import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../../utils/chat-shell-icons.ts'
import { userInitials } from '../../utils/user-initials.ts'
import {
  accountAvatarStyle,
  accountMenuHeaderStyle,
  accountMenuItemDisabledStyle,
  accountMenuItemLabelStyle,
  accountMenuItemStyle,
  accountMenuLogoutFormStyle,
  accountMenuSoonStyle,
  accountNameStyle,
} from '../styles/chat-shell/sidebar-styles.ts'
import { LucideIcon } from './lucide-icon.tsx'

export function accountDisplayName(name: string, email: string): string {
  return name.trim() || email.trim() || 'Account'
}

export function accountInitials(name: string, email: string): string {
  return userInitials({ name, email }) || '?'
}

/** Menu body — call as a function from ChatSidebar render, not as `<Component />`. */
export function accountMenuBody(name: string, email: string) {
  let displayName = accountDisplayName(name, email)
  let initials = accountInitials(name, email)

  return (
    <>
      <div mix={accountMenuHeaderStyle}>
        <span mix={accountAvatarStyle} aria-hidden="true">
          {initials}
        </span>
        <span mix={accountNameStyle}>{displayName}</span>
      </div>

      {(
        [
          { key: 'profile', label: SHELL_COPY.profile, icon: SHELL_LUCIDE_ICON.profile },
          { key: 'settings', label: SHELL_COPY.settings, icon: SHELL_LUCIDE_ICON.settings },
          { key: 'help', label: SHELL_COPY.help, icon: SHELL_LUCIDE_ICON.help },
        ] as const
      ).map((item) => (
        <div
          key={item.key}
          role="menuitem"
          aria-disabled="true"
          title={SHELL_COPY.comingSoon}
          mix={accountMenuItemDisabledStyle}
        >
          <span mix={accountMenuItemLabelStyle}>
            <LucideIcon icon={item.icon} size={16} strokeWidth={1.75} />
            {item.label}
          </span>
          <span mix={accountMenuSoonStyle}>{SHELL_COPY.comingSoon}</span>
        </div>
      ))}

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

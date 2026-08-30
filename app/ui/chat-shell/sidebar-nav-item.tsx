import { navigate, on, type Handle } from 'remix/ui'

import {
  sidebarItemActiveStyle,
  sidebarItemLabelStyle,
  sidebarItemStyle,
} from '../styles/chat-shell/sidebar-styles.ts'
import type { ShellNavItem } from '../../utils/chat-shell-nav.ts'
import { dispatchNewChat } from '../../utils/new-chat.ts'
import { LucideIcon } from './lucide-icon.tsx'

export function SidebarNavItem(handle: Handle<ShellNavItem>) {
  return () => {
    let { href, icon, label, active = false, resetChatOnSamePath = false } = handle.props

    return (
      <a
        href={href}
        data-sidebar-item=""
        aria-label={label}
        title={label}
        mix={[
          sidebarItemStyle,
          active ? sidebarItemActiveStyle : undefined,
          resetChatOnSamePath
            ? on('click', (event) => {
                if (typeof window === 'undefined') return
                // Pathname-only same-path checks miss `?knowledge=` — always soft-nav
                // to `/` so clientEntry props clear (setup-scope alone is not enough).
                event.preventDefault()
                dispatchNewChat()
                void navigate(href)
              })
            : undefined,
        ]}
      >
        <LucideIcon icon={icon} strokeWidth={1.75} />
        <span data-sidebar-label="" mix={sidebarItemLabelStyle}>
          {label}
        </span>
      </a>
    )
  }
}

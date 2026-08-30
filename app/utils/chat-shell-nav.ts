import type { IconNode } from 'lucide'

/** Sidebar nav row — shared by chat shell chrome (utils/, not /types). */
export interface ShellNavItem {
  href: string
  icon: IconNode
  label: string
  active?: boolean
  /** Intercept same-path clicks so setup-scope chat state can reset. */
  resetChatOnSamePath?: boolean
}

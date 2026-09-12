import {
  ArrowUp,
  ChevronDown,
  CircleHelp,
  Ellipsis,
  FileText,
  Library,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  User,
  X,
} from 'lucide'

import type { IconNode } from 'lucide'

/** Lucide icon nodes for grayscale chat shell (§3.5 skin). */
export const SHELL_LUCIDE_ICON = {
  sidebarOpen: PanelLeft,
  sidebarClose: PanelLeftClose,
  newChat: SquarePen,
  library: Library,
  plans: Sparkles,
  settings: Settings,
  help: CircleHelp,
  profile: User,
  logOut: LogOut,
  chevron: ChevronDown,
  attach: Plus,
  send: ArrowUp,
  file: FileText,
  remove: X,
  search: Search,
  more: Ellipsis,
} as const satisfies Record<string, IconNode>

export type ShellLucideIconKey = keyof typeof SHELL_LUCIDE_ICON

export const SHELL_BRAND = {
  remixLogo: '/favicon.svg',
} as const

export interface ShellLucideIconProps {
  icon: IconNode
  size?: number
  strokeWidth?: number
}

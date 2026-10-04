import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  CircleHelp,
  Ellipsis,
  FileText,
  Key,
  Library,
  LogOut,
  PanelLeft,
  PanelLeftClose,
  Pencil,
  Plus,
  Search,
  Settings,
  Sparkles,
  SquarePen,
  User,
  X,
  X as Close,
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
  scrollBottom: ArrowDown,
  attach: Plus,
  send: ArrowUp,
  file: FileText,
  remove: X,
  close: Close,
  sparkles: Sparkles,
  search: Search,
  more: Ellipsis,
  edit: Pencil,
  key: Key,
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

/**
 * Home route page — guest empty state or authenticated chat landing (actions/, §2.1).
 */
import type { Handle } from 'remix/ui'

import { ChatShellPage, type ChatShellPageProps } from '../ui/chat-shell-page.tsx'

export type HomePageProps = ChatShellPageProps

export function HomePage(handle: Handle<HomePageProps>) {
  return ChatShellPage(handle)
}

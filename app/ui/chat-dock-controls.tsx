/**
 * Always-mounted ↓ fab + generating dots above the composer (prd-chat-viewport CV-4/CV-5).
 */
import { on, ref, type Handle } from 'remix/ui'

import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../utils/chat-shell-icons.ts'
import {
  dockControlsStyle,
  generatingDotStyle,
  generatingIndicatorStyle,
  scrollFabStyle,
} from './styles/chat-shell/main-styles.ts'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'

export interface ChatDockControlsProps {
  showScrollFab: boolean
  streaming: boolean
  empty: boolean
  onJumpToBottom: () => void
  onScrollFabRef: (el: HTMLElement | null) => void
  onGeneratingRef: (el: HTMLElement | null) => void
  onDotRef: (index: number, el: HTMLElement | null) => void
}

export function ChatDockControls(handle: Handle<ChatDockControlsProps>) {
  return () => {
    let {
      showScrollFab,
      streaming,
      empty,
      onJumpToBottom,
      onScrollFabRef,
      onGeneratingRef,
      onDotRef,
    } = handle.props

    return (
      <div mix={dockControlsStyle} data-empty={empty ? 'true' : 'false'}>
        <button
          type="button"
          mix={[
            scrollFabStyle,
            ref((node) => {
              onScrollFabRef(node as HTMLElement | null)
            }),
            on('click', () => onJumpToBottom()),
          ]}
          data-visible={showScrollFab ? 'true' : 'false'}
          aria-label={SHELL_COPY.scrollToBottom}
          aria-hidden={showScrollFab ? undefined : 'true'}
          tabindex={showScrollFab ? 0 : -1}
        >
          <LucideIcon icon={SHELL_LUCIDE_ICON.scrollBottom} size={18} strokeWidth={2} />
        </button>
        <div
          mix={[
            generatingIndicatorStyle,
            ref((node) => {
              onGeneratingRef(node as HTMLElement | null)
            }),
          ]}
          data-visible={streaming ? 'true' : 'false'}
          role="status"
          aria-live="polite"
          aria-label={SHELL_COPY.generating}
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              mix={[
                generatingDotStyle,
                ref((node) => {
                  onDotRef(i, node as HTMLElement | null)
                }),
              ]}
            />
          ))}
        </div>
      </div>
    )
  }
}

/**
 * Conversation search modal — §3.5 Conversation search (Figma 7:977): debounced local
 * title filter over the sidebar's conversation list. No network search; each tick owns
 * an AbortController, stale ticks dropped. Rows navigate via shellChatHref. No React
 * hooks / <motion.*>.
 */
import { on, ref, type Handle } from 'remix/ui'

import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import { SHELL_LUCIDE_ICON } from '../utils/chat-shell-icons.ts'
import { animateMenuFade } from '../utils/motion.ts'
import { debounce } from '../utils/debounce.ts'
import type { ConversationSummary } from '../utils/chat-types.ts'
import { shellChatHref } from '../utils/chat-shell-urls.ts'
import {
  conversationSearchOverlayStyle,
  conversationSearchStyle,
  conversationSearchHeaderStyle,
  conversationSearchFieldStyle,
  conversationSearchInputStyle,
  conversationSearchListStyle,
  conversationSearchSectionLabelStyle,
  conversationSearchItemStyle,
  conversationSearchItemLabelStyle,
  settingsModalSrOnlyStyle,
  settingsModalCloseStyle,
  settingsModalInputHintStyle,
} from './styles/chat-shell/sidebar-styles.ts'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'

export interface ConversationSearchModalProps {
  conversations: ConversationSummary[]
  onClose: () => void
}

const SEARCH_DEBOUNCE_MS = 200

function conversationLabel(row: ConversationSummary): string {
  if (row.title && row.title.trim()) return row.title.trim()
  return 'Untitled chat'
}

export function ConversationSearchModal(handle: Handle<ConversationSearchModalProps>) {
  let visibleQuery = ''
  let searchAbort: AbortController | null = null
  let modalEl: HTMLElement | null = null
  let overlayEl: HTMLElement | null = null
  let searchInputEl: HTMLInputElement | null = null
  let focusableEls: HTMLElement[] = []

  function visibleConversations(): ConversationSummary[] {
    return handle.props.conversations.filter(
      (row) => visibleQuery === '' || conversationLabel(row).toLowerCase().includes(visibleQuery),
    )
  }

  async function applySearch(query: string, signal: AbortSignal) {
    // Yield one microtask so a close/abort between tick and apply drops the stale tick.
    await Promise.resolve()
    if (signal.aborted) return
    visibleQuery = query
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
    searchDebounce((event.target as HTMLInputElement).value)
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
        !(el as HTMLButtonElement | HTMLInputElement).disabled && el.offsetParent !== null,
    )
  }

  if (typeof window !== 'undefined') {
    let lastFocused: HTMLElement | null = null
    handle.queueTask(() => {
      lastFocused = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
      searchInputEl?.focus()
      updateFocusable()
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

    handle.signal.addEventListener('abort', () => {
      window.removeEventListener('keydown', onKeyDown)
      document.body.style.overflow = ''
      lastFocused?.focus()
    })
  }

  return () => {
    let rows = visibleConversations()

    return (
      <div
        mix={[
          conversationSearchOverlayStyle,
          on('click', closeModal),
          ref((node) => {
            overlayEl = node as HTMLElement
          }),
        ]}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conversation-search-title"
      >
        <div
          mix={[
            conversationSearchStyle,
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
          <h2 id="conversation-search-title" mix={settingsModalSrOnlyStyle}>
            {SHELL_COPY.conversationSearchLabel}
          </h2>

          <div mix={conversationSearchHeaderStyle}>
            <div mix={conversationSearchFieldStyle}>
              <LucideIcon icon={SHELL_LUCIDE_ICON.search} size={16} strokeWidth={1.75} />
              <label htmlFor="conversation-search" mix={settingsModalSrOnlyStyle}>
                {SHELL_COPY.conversationSearchLabel}
              </label>
              <input
                id="conversation-search"
                name="search"
                type="text"
                placeholder={SHELL_COPY.conversationSearchPlaceholder}
                mix={[
                  conversationSearchInputStyle,
                  ref((node) => {
                    searchInputEl = node as HTMLInputElement
                  }),
                  on<HTMLInputElement, 'input'>('input', onSearchInput),
                ]}
              />
            </div>
            <button
              type="button"
              aria-label="Close search"
              mix={[settingsModalCloseStyle, on('click', closeModal)]}
            >
              <LucideIcon icon={SHELL_LUCIDE_ICON.close} size={20} strokeWidth={1.75} />
            </button>
          </div>

          <div
            // Internal scroller opts out of the root Lenis hijack (§4.3).
            data-lenis-prevent=""
            mix={conversationSearchListStyle}
            aria-label={SHELL_COPY.conversations}
          >
            <p mix={conversationSearchSectionLabelStyle}>{SHELL_COPY.conversations}</p>
            {rows.map((row) => (
              <a
                key={row.id}
                href={shellChatHref(row.id)}
                aria-label={conversationLabel(row)}
                title={conversationLabel(row)}
                mix={[
                  conversationSearchItemStyle,
                  on('click', () => {
                    closeModal()
                  }),
                ]}
              >
                <LucideIcon icon={SHELL_LUCIDE_ICON.chatBubble} size={18} strokeWidth={1.75} />
                <span mix={conversationSearchItemLabelStyle}>{conversationLabel(row)}</span>
              </a>
            ))}
            {rows.length === 0 && (
              <span mix={settingsModalInputHintStyle}>{SHELL_COPY.conversationSearchEmpty}</span>
            )}
          </div>
        </div>
      </div>
    )
  }
}

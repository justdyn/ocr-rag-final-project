/**
 * Primary app sidebar — shared chrome for chat shell (app/ui/, §2.1 / §3.5).
 */
import { clientEntry, on, ref, type Handle, type SerializableProps } from 'remix/ui'

import { routes } from '../routes.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'
import { SHELL_BRAND, SHELL_LUCIDE_ICON } from '../utils/chat-shell-icons.ts'
import type { ShellNavItem } from '../utils/chat-shell-nav.ts'
import { chatShellScopeKey } from '../utils/chat-shell-scope.ts'
import {
  defaultSidebarOpen,
  SIDEBAR_MOBILE_QUERY,
  SIDEBAR_OPEN_EVENT,
  sidebarOpenAfterAuthChange,
} from '../utils/chat-shell-sidebar.ts'
import { shellChatHref } from '../utils/chat-shell-urls.ts'
import type { ConversationSummary } from '../utils/chat-types.ts'
import { animateMenuFade } from '../utils/motion.ts'
import {
  CONVERSATION_UPSERT_EVENT,
  NEW_CHAT_EVENT,
  upsertConversationList,
  type ConversationUpsertDetail,
} from '../utils/new-chat.ts'
import {
  iconButtonStyle,
  sidebarBackdropStyle,
  sidebarConversationsStyle,
  sidebarFooterNavStyle,
  sidebarHeaderCollapsedStyle,
  sidebarHeaderStyle,
  sidebarHomeLinkStyle,
  sidebarNavStyle,
  sidebarSpacerStyle,
  sidebarStyle,
  sidebarItemLabelStyle,
  sidebarItemStyle,
  sidebarItemActiveStyle,
  sidebarTrackStyle,
  sidebarSectionLabelStyle,
} from './styles/chat-shell/sidebar-styles.ts'
import { BrandLogo } from './chat-shell/brand-logo.tsx'
import { LucideIcon } from './chat-shell/lucide-icon.tsx'
import {
  accountAvatarStyle,
  accountDisplayName,
  accountInitials,
  accountMenuBody,
  accountMenuStyle,
  accountNameStyle,
  accountTriggerStyle,
  accountWrapStyle,
} from './chat-shell/sidebar-account.tsx'
import { SidebarCta } from './chat-shell/sidebar-cta.tsx'
import { SidebarNavItem } from './chat-shell/sidebar-nav-item.tsx'

export type ShellActiveNav = 'chat'

export interface ChatSidebarProps extends SerializableProps {
  initialOpen?: boolean
  authenticated?: boolean
  activeNav?: ShellActiveNav
  activeKnowledgeId?: string | null
  activeConversationId?: string | null
  conversations?: ConversationSummary[]
  userName?: string
  userEmail?: string
}

function buildPrimaryNav(
  authenticated: boolean,
  activeNav: ShellActiveNav,
  activeConversationId: string | null,
): ShellNavItem[] {
  return [
    {
      href: routes.home.href(),
      icon: SHELL_LUCIDE_ICON.newChat,
      label: SHELL_COPY.newChat,
      active: activeNav === 'chat' && (!authenticated || !activeConversationId),
      resetChatOnSamePath: true,
    },
  ]
}

function conversationLabel(row: ConversationSummary): string {
  if (row.title && row.title.trim()) return row.title.trim()
  return 'Untitled chat'
}

export const ChatSidebar = clientEntry(
  import.meta.url,
  function ChatSidebar(handle: Handle<ChatSidebarProps>) {
    // SSR/unknown → closed; client matchMedia opens desktop. Do not default-open on mobile.
    let isOpen =
      handle.props.initialOpen ??
      defaultSidebarOpen(
        typeof window === 'undefined' ? null : window.matchMedia(SIDEBAR_MOBILE_QUERY),
      )
    let accountMenuOpen = false
    let accountMenuEl: HTMLElement | null = null
    let accountRootEl: HTMLElement | null = null
    // Setup-scope copies of SSR props so client-created chats can appear without reload.
    let knowledgeId = handle.props.activeKnowledgeId ?? null
    let activeConversationId = handle.props.activeConversationId ?? null
    let conversations: ConversationSummary[] = [
      ...(handle.props.conversations ?? []),
    ]
    // Soft-nav reuses this clientEntry — sync only when SSR props change, not when
    // client upsert/new-chat advances setup-scope ahead of still-stale props.
    let appliedFromPropsKey = chatShellScopeKey(knowledgeId, activeConversationId)
    // Starts false so the first authenticated render (login 303 new mount) applies
    // the viewport default. After that, lastAuthenticated tracks props so already-auth
    // navigations do not re-open a sidebar the user closed.
    let lastAuthenticated = false

    function setAccountMenuOpen(next: boolean) {
      accountMenuOpen = next
      handle.update()
      // Opacity fade — expandCollapse height anim is for in-flow panels, not absolute menus.
      handle.queueTask(() => {
        if (accountMenuEl) animateMenuFade(accountMenuEl, next)
      })
    }

    // Register on setup (same window-event pattern as NEW_CHAT_EVENT → main panel).
    if (typeof window !== 'undefined') {
      // First paint after login 303/full load: setup may run before layout viewport
      // is current. Re-apply matchMedia so desktop opens and mobile stays closed.
      handle.queueTask(() => {
        isOpen = defaultSidebarOpen(window.matchMedia(SIDEBAR_MOBILE_QUERY))
        if (!isOpen) accountMenuOpen = false
        handle.update()
      })
      let onNewChat = () => {
        activeConversationId = null
        // Acknowledge current props; soft-nav to `/` then applies empty SSR scope.
        appliedFromPropsKey = chatShellScopeKey(
          handle.props.activeKnowledgeId,
          handle.props.activeConversationId,
        )
        handle.update()
      }
      let onConversationUpsert = (event: Event) => {
        let detail = (event as CustomEvent<ConversationUpsertDetail>).detail
        if (!detail?.knowledgeId || !detail.conversation?.id) return
        let replaceScope = knowledgeId !== detail.knowledgeId
        knowledgeId = detail.knowledgeId
        activeConversationId = detail.conversation.id
        conversations = upsertConversationList(
          conversations,
          detail.conversation,
          replaceScope,
        )
        handle.update()
      }
      let onSidebarOpen = () => {
        isOpen = true
        handle.update()
      }
      let onKeyDown = (event: KeyboardEvent) => {
        if (event.key !== 'Escape') return
        if (accountMenuOpen) {
          setAccountMenuOpen(false)
          return
        }
        if (isOpen) {
          isOpen = false
          handle.update()
        }
      }
      let onPointerDown = (event: PointerEvent) => {
        if (!accountMenuOpen || !accountRootEl) return
        if (accountRootEl.contains(event.target as Node)) return
        setAccountMenuOpen(false)
      }
      window.addEventListener(NEW_CHAT_EVENT, onNewChat)
      window.addEventListener(CONVERSATION_UPSERT_EVENT, onConversationUpsert)
      window.addEventListener(SIDEBAR_OPEN_EVENT, onSidebarOpen)
      window.addEventListener('keydown', onKeyDown)
      window.addEventListener('pointerdown', onPointerDown)

      let mobileQuery = window.matchMedia(SIDEBAR_MOBILE_QUERY)
      let lastMobile = mobileQuery.matches
      let syncViewport = () => {
        let mobile = mobileQuery.matches
        if (mobile === lastMobile) return
        lastMobile = mobile
        isOpen = defaultSidebarOpen(mobileQuery)
        if (!isOpen) accountMenuOpen = false
        handle.update()
      }
      // matchMedia `change` plus resize: some environments update matches without firing change.
      mobileQuery.addEventListener('change', syncViewport)
      window.addEventListener('resize', syncViewport)

      handle.signal.addEventListener('abort', () => {
        window.removeEventListener(NEW_CHAT_EVENT, onNewChat)
        window.removeEventListener(CONVERSATION_UPSERT_EVENT, onConversationUpsert)
        window.removeEventListener(SIDEBAR_OPEN_EVENT, onSidebarOpen)
        window.removeEventListener('keydown', onKeyDown)
        window.removeEventListener('pointerdown', onPointerDown)
        mobileQuery.removeEventListener('change', syncViewport)
        window.removeEventListener('resize', syncViewport)
      })
    }

    return () => {
      let propScopeKey = chatShellScopeKey(
        handle.props.activeKnowledgeId,
        handle.props.activeConversationId,
      )
      if (propScopeKey !== appliedFromPropsKey) {
        activeConversationId = handle.props.activeConversationId ?? null
        // Soft-nav to `/` clears SSR knowledge; keep client KB + recent rows so the
        // list stays clickable after New chat (same UX as pre-navigate pushState).
        if (handle.props.activeKnowledgeId) {
          knowledgeId = handle.props.activeKnowledgeId
          conversations = [...(handle.props.conversations ?? [])]
        }
        appliedFromPropsKey = propScopeKey
      }

      let authenticated = handle.props.authenticated ?? false
      let nextOpen = sidebarOpenAfterAuthChange(
        lastAuthenticated,
        authenticated,
        typeof window === 'undefined' ? null : window.matchMedia(SIDEBAR_MOBILE_QUERY),
      )
      if (nextOpen !== null) {
        isOpen = nextOpen
        if (!isOpen) accountMenuOpen = false
      }
      lastAuthenticated = authenticated
      let activeNav = handle.props.activeNav ?? 'chat'
      let userName = handle.props.userName ?? ''
      let userEmail = handle.props.userEmail ?? ''
      let primaryNav = buildPrimaryNav(authenticated, activeNav, activeConversationId)
      let displayName = accountDisplayName(userName, userEmail)
      let initials = accountInitials(userName, userEmail)
      let compact = !isOpen

      return (
        <>
          <button
            type="button"
            aria-label="Close sidebar backdrop"
            data-open={isOpen ? 'true' : 'false'}
            mix={[
              sidebarBackdropStyle,
              on('click', () => {
                isOpen = false
                accountMenuOpen = false
                handle.update()
              }),
            ]}
          />

          <div data-open={isOpen ? 'true' : 'false'} mix={sidebarTrackStyle}>
            <aside
              data-open={isOpen ? 'true' : 'false'}
              mix={sidebarStyle}
              aria-label="Chat navigation"
            >
              <div mix={[sidebarHeaderStyle, isOpen ? undefined : sidebarHeaderCollapsedStyle]}>
                {/* Always <a>+<button>: omitting Home when collapsed hydrates as `tag button a`. */}
                <a
                  key="home"
                  href={routes.home.href()}
                  aria-label="Home"
                  aria-hidden={isOpen ? 'false' : 'true'}
                  tabIndex={isOpen ? 0 : -1}
                  data-collapsed={isOpen ? 'false' : 'true'}
                  mix={[iconButtonStyle, sidebarHomeLinkStyle]}
                >
                  <BrandLogo src={SHELL_BRAND.remixLogo} size={24} alt="Remix" />
                </a>
                <button
                  key="toggle"
                  type="button"
                  aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'}
                  mix={[
                    iconButtonStyle,
                    on('click', () => {
                      isOpen = !isOpen
                      if (!isOpen) accountMenuOpen = false
                      handle.update()
                    }),
                  ]}
                >
                  <LucideIcon
                    icon={isOpen ? SHELL_LUCIDE_ICON.sidebarClose : SHELL_LUCIDE_ICON.sidebarOpen}
                    size={20}
                    strokeWidth={1.75}
                  />
                </button>
              </div>

              <nav data-sidebar-nav="" mix={sidebarNavStyle}>
                {primaryNav.map((item) => (
                  <SidebarNavItem
                    key={item.label}
                    href={item.href}
                    icon={item.icon}
                    label={item.label}
                    active={item.active}
                    resetChatOnSamePath={item.resetChatOnSamePath}
                  />
                ))}
              </nav>

              {authenticated && knowledgeId && conversations.length > 0 ? (
                <nav
                  data-sidebar-nav=""
                  mix={sidebarConversationsStyle}
                  // Internal sidebar scroller opts out of the root Lenis hijack (§4.3).
                  data-lenis-prevent=""
                  aria-label={SHELL_COPY.conversations}
                >
                  <p
                    data-collapsed={isOpen ? 'false' : 'true'}
                    mix={sidebarSectionLabelStyle}
                  >
                    {SHELL_COPY.conversations}
                  </p>
                  {conversations.map((row) => {
                    let href = shellChatHref(row.id)
                    let active = activeConversationId === row.id && activeNav === 'chat'
                    return (
                      <a
                        key={row.id}
                        href={href}
                        data-sidebar-item=""
                        aria-label={conversationLabel(row)}
                        title={conversationLabel(row)}
                        mix={[sidebarItemStyle, active ? sidebarItemActiveStyle : undefined]}
                      >
                        <span data-sidebar-label="" mix={sidebarItemLabelStyle}>
                          {conversationLabel(row)}
                        </span>
                      </a>
                    )
                  })}
                </nav>
              ) : null}

              <div mix={sidebarSpacerStyle} />

              {/* Guest + auth footer always mounted: login-redirect morph hydrates
                  this clientEntry onto leftover nodes; swapping `<a>`/`<div>` for
                  `<button>` logged `tag button a` / `tag button div` and left a
                  duplicate account row. Hide with data-collapsed, never unmount. */}
              <nav
                data-sidebar-nav=""
                data-collapsed={authenticated ? 'true' : 'false'}
                aria-hidden={authenticated ? 'true' : 'false'}
                mix={sidebarFooterNavStyle}
                aria-label="Account"
              >
                <SidebarNavItem
                  href={routes.login.index.href()}
                  icon={SHELL_LUCIDE_ICON.settings}
                  label={SHELL_COPY.login}
                />
              </nav>
              <SidebarCta collapsed={!isOpen || authenticated} />
              <div
                data-collapsed={authenticated ? 'false' : 'true'}
                aria-hidden={authenticated ? 'false' : 'true'}
                mix={[
                  accountWrapStyle,
                  ref((node) => {
                    accountRootEl = node as HTMLElement
                  }),
                ]}
              >
                <div
                  data-open={accountMenuOpen && !compact && authenticated ? 'true' : 'false'}
                  mix={[
                    accountMenuStyle,
                    ref((node) => {
                      accountMenuEl = node as HTMLElement
                      if (!accountMenuOpen || compact || !authenticated) {
                        accountMenuEl.style.opacity = '0'
                      }
                    }),
                  ]}
                  role="menu"
                  aria-label="Account menu"
                >
                  {accountMenuBody(userName, userEmail)}
                </div>
                <button
                  type="button"
                  data-sidebar-item=""
                  data-account-trigger=""
                  tabIndex={authenticated ? 0 : -1}
                  aria-haspopup={compact || !authenticated ? undefined : 'menu'}
                  aria-expanded={compact || !authenticated ? undefined : accountMenuOpen}
                  aria-label={
                    compact
                      ? `Expand sidebar (${displayName})`
                      : `Account menu for ${displayName}`
                  }
                  mix={[
                    accountTriggerStyle,
                    on('click', () => {
                      if (!authenticated) return
                      if (compact) {
                        isOpen = true
                        handle.update()
                        return
                      }
                      setAccountMenuOpen(!accountMenuOpen)
                    }),
                  ]}
                >
                  <span mix={accountAvatarStyle} aria-hidden="true">
                    {initials}
                  </span>
                  <span data-sidebar-label="" mix={accountNameStyle}>
                    {displayName}
                  </span>
                </button>
              </div>
            </aside>
          </div>
        </>
      )
    }
  },
)

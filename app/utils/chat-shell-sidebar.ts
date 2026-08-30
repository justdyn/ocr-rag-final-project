export const SIDEBAR_WIDTH_PX = 260
export const SIDEBAR_COLLAPSED_WIDTH_PX = 52
/** Narrow viewport: overlay sidebar, closed by default (matches CSS + matchMedia). */
export const SIDEBAR_MOBILE_MAX_PX = 900
export const SIDEBAR_DESKTOP_MIN_PX = SIDEBAR_MOBILE_MAX_PX + 1
export const SIDEBAR_MOBILE_QUERY = `(max-width: ${SIDEBAR_MOBILE_MAX_PX}px)`
export const SIDEBAR_ANIM_MS = 320
export const SIDEBAR_EASE = 'var(--home-ease-out)'
export const SIDEBAR_TRANSITION = `width ${SIDEBAR_ANIM_MS}ms ${SIDEBAR_EASE}, transform ${SIDEBAR_ANIM_MS}ms ${SIDEBAR_EASE}, opacity ${SIDEBAR_ANIM_MS}ms ${SIDEBAR_EASE}`
export const SIDEBAR_TRACK_TRANSITION = `max-width ${SIDEBAR_ANIM_MS}ms ${SIDEBAR_EASE}, width ${SIDEBAR_ANIM_MS}ms ${SIDEBAR_EASE}`
export const SIDEBAR_LABEL_TRANSITION = `opacity ${SIDEBAR_ANIM_MS}ms ${SIDEBAR_EASE}, max-width ${SIDEBAR_ANIM_MS}ms ${SIDEBAR_EASE}`

/** Header mobile toggle → sidebar open (setup-scope listeners, same pattern as NEW_CHAT_EVENT). */
export const SIDEBAR_OPEN_EVENT = 'docintel:sidebar-open'

export function dispatchSidebarOpen(): void {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(SIDEBAR_OPEN_EVENT))
}

/**
 * Default open/closed from a matchMedia-like `{ matches }` for `SIDEBAR_MOBILE_QUERY`.
 * Unknown viewport (SSR) → closed so mobile first paint is not an overlay collision.
 */
export function defaultSidebarOpen(query: { matches: boolean } | null): boolean {
  if (!query) return false
  return !query.matches
}

/**
 * Login morph reuses ChatSidebar (`$rmx.render`, setup/queueTask do not re-run).
 * Apply the viewport default only on guest→auth — not on later already-auth navigations.
 */
export function sidebarOpenAfterAuthChange(
  wasAuthenticated: boolean,
  isAuthenticated: boolean,
  query: { matches: boolean } | null,
): boolean | null {
  if (wasAuthenticated || !isAuthenticated) return null
  return defaultSidebarOpen(query)
}

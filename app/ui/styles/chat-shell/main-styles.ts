import { css } from 'remix/ui'

import { SIDEBAR_DESKTOP_MIN_PX } from '../../../utils/chat-shell-sidebar.ts'

export const mainStyle = css({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  // No horizontal padding here — the thread scroller must be full-bleed so the
  // scrollbar sits on the main-panel right edge (ChatGPT pattern), not beside
  // the max-width message column. Padding lives on the centered inner column.
  overflow: 'hidden',
})

export const mainHeaderStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '52px',
  padding: '8px 15px',
  flexShrink: 0,
  zIndex: 2,
  background: 'var(--home-bg)',
  gap: '8px',
})

/** Toggle + title share one flex row so the mobile open control never overlaps Remix. */
export const headerLeadingStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  flex: '1 1 auto',
})

/** Mobile-only open control — desktop uses the in-sidebar collapse controls. */
export const headerSidebarOpenStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  padding: 0,
  width: '36px',
  height: '36px',
  flexShrink: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--home-fg)',
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
  '&:active': { transform: 'scale(0.96)' },
  [`@media (min-width: ${SIDEBAR_DESKTOP_MIN_PX}px)`]: { display: 'none' },
})

export const modelSelectorStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  minHeight: '36px',
  padding: '3px 10px',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--home-fg)',
  cursor: 'pointer',
  font: 'inherit',
  transition: 'background-color 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
})

export const modelNameStyle = css({
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  fontWeight: 600,
  fontSize: '18px',
  lineHeight: '28px',
  letterSpacing: '-0.27px',
})

export const headerActionsStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '9px',
})

export const primaryPillStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  minHeight: '34px',
  padding: '7px 12px',
  borderRadius: '9999px',
  background: 'var(--home-fg)',
  color: 'var(--home-bg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'opacity 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { opacity: 0.88, outline: 'none' },
  '&:active': { transform: 'scale(0.98)' },
})

export const secondaryPillStyle = css({
  appearance: 'none',
  margin: 0,
  minHeight: '36px',
  padding: '8px 13px',
  borderRadius: '9999px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-bg)',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition:
    'background-color 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
  '&:active': { transform: 'scale(0.98)' },
})

export const mainContentStyle = css({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minHeight: 0,
  width: '100%',
  maxWidth: '768px',
  margin: '0 auto',
  padding: '0 15px',
})

/**
 * Full-bleed chat scroller — owns overflow across the entire main panel so the
 * scrollbar sits on the right edge; message column stays centered inside.
 * data-empty="true": vertically center the hero (composer stays in the dock).
 */
export const chatScrollRegionStyle = css({
  flex: '1 1 auto',
  minHeight: 0,
  width: '100%',
  overflowY: 'auto',
  '&[data-empty="true"]': {
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
  },
})

/** Centered message / composer column inside the full-bleed scroller or dock. */
export const chatColumnStyle = css({
  width: '100%',
  maxWidth: '768px',
  margin: '0 auto',
  padding: '0 15px',
})

/** Pins composer + legal footer below the thread scroller — always mounted. */
export const composerDockStyle = css({
  flexShrink: 0,
  width: '100%',
  padding: '0 0 8px',
})

/** Empty-state hero stack inside the scroll region (composer lives in the dock). */
export const emptyStageStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  gap: '24px',
  padding: '24px 0',
})

/** Hidden when chat has messages — always in the DOM for hydration stability. */
export const emptyStageHiddenStyle = css({
  display: 'none',
})

/** Hidden when the thread is empty — always in the DOM for hydration stability. */
export const chatThreadHiddenStyle = css({
  display: 'none',
})

export const heroStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  textAlign: 'center',
})

export const heroHeadingStyle = css({
  margin: 0,
  padding: '4px',
  fontWeight: 400,
  fontSize: '24px',
  lineHeight: '28px',
  letterSpacing: '0.07px',
  color: 'var(--home-fg)',
})

export const legalFooterStyle = css({
  flexShrink: 0,
  marginTop: 'auto',
  padding: '8px 8px 24px',
  textAlign: 'center',
  '& p': {
    margin: 0,
    fontSize: '14px',
    lineHeight: '14px',
    color: 'var(--home-subtle)',
    maxWidth: '42rem',
    marginLeft: 'auto',
    marginRight: 'auto',
  },
})

export const legalLinkStyle = css({
  color: 'inherit',
  textDecoration: 'underline',
  textUnderlineOffset: '2px',
  transition: 'color 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { color: 'var(--home-fg)', outline: 'none' },
})

/** Authenticated chat thread — grows with content; parent region scrolls. */
export const chatThreadStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '24px',
  width: '100%',
  padding: '16px 0 24px',
})

export const scopePromptStyle = css({
  width: '100%',
  maxWidth: '420px',
  padding: '20px',
  borderRadius: '16px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-surface)',
  display: 'flex',
  flexDirection: 'column',
  gap: '12px',
})

export const scopePromptTitleStyle = css({
  margin: 0,
  fontWeight: 600,
  fontSize: '16px',
  lineHeight: '22px',
  color: 'var(--home-fg)',
})

export const scopePromptBodyStyle = css({
  margin: 0,
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-muted)',
})

export const shellAlertStyle = css({
  width: '100%',
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-surface)',
  color: 'var(--home-fg)',
  fontSize: '14px',
  lineHeight: '20px',
})

/** Full-bleed scroller for DocIntel content routes (same edge-scrollbar rule). */
export const mainContentWideStyle = css({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minHeight: 0,
  width: '100%',
  overflowY: 'auto',
  padding: '16px 15px 32px',
})

export const contentPanelStyle = css({
  width: '100%',
  maxWidth: '960px',
  margin: '0 auto',
})

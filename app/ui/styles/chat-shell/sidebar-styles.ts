import { css } from 'remix/ui'

import {
  SIDEBAR_COLLAPSED_WIDTH_PX,
  SIDEBAR_DESKTOP_MIN_PX,
  SIDEBAR_LABEL_TRANSITION,
  SIDEBAR_MOBILE_MAX_PX,
  SIDEBAR_TRACK_TRANSITION,
  SIDEBAR_TRANSITION,
  SIDEBAR_WIDTH_PX,
} from '../../../utils/chat-shell-sidebar.ts'

export const sidebarTrackStyle = css({
  position: 'relative',
  flexShrink: 0,
  maxWidth: `${SIDEBAR_WIDTH_PX}px`,
  width: `${SIDEBAR_WIDTH_PX}px`,
  overflow: 'hidden',
  transition: SIDEBAR_TRACK_TRANSITION,
  '&[data-open="false"]': {
    maxWidth: `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
    width: `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
  },
  [`@media (max-width: ${SIDEBAR_MOBILE_MAX_PX}px)`]: {
    position: 'fixed',
    left: 0,
    top: 0,
    height: '100dvh',
    zIndex: 50,
    maxWidth: `${SIDEBAR_WIDTH_PX}px`,
    width: `${SIDEBAR_WIDTH_PX}px`,
    '&[data-open="false"]': {
      maxWidth: '0px',
      width: '0px',
      pointerEvents: 'none',
    },
  },
})

export const sidebarBackdropStyle = css({
  position: 'fixed',
  inset: 0,
  zIndex: 40,
  background: 'rgba(13, 13, 13, 0.24)',
  opacity: 0,
  pointerEvents: 'none',
  transition: 'opacity 320ms var(--home-ease-out)',
  '&[data-open="true"]': {
    opacity: 1,
    pointerEvents: 'auto',
  },
  [`@media (min-width: ${SIDEBAR_DESKTOP_MIN_PX}px)`]: { display: 'none' },
})

export const sidebarStyle = css({
  display: 'flex',
  flexDirection: 'column',
  flexShrink: 0,
  width: `${SIDEBAR_WIDTH_PX}px`,
  height: '100%',
  background: 'var(--home-bg)',
  borderRight: '1px solid var(--home-border)',
  transform: 'translateX(0)',
  opacity: 1,
  transition: SIDEBAR_TRANSITION,
  willChange: 'width, transform, opacity',
  '&[data-open="false"]': {
    width: `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
    '& [data-sidebar-item] [data-sidebar-label]': {
      display: 'none',
    },
    '& [data-sidebar-item]': {
      justifyContent: 'center',
      alignItems: 'center',
      gap: 0,
      padding: '6px',
    },
    '& [data-account-trigger]': {
      justifyContent: 'center',
      alignItems: 'center',
      gap: 0,
      padding: '6px',
    },
    '& [data-account-trigger] [data-sidebar-label]': {
      display: 'none',
    },
    '& [data-sidebar-nav]': {
      paddingLeft: '6px',
      paddingRight: '6px',
    },
    '& > [data-collapsed="false"]': {
      padding: '6px',
    },
  },
  [`@media (max-width: ${SIDEBAR_MOBILE_MAX_PX}px)`]: {
    boxShadow: '4px 0 24px rgba(0, 0, 0, 0.08)',
    '&[data-open="false"]': {
      width: `${SIDEBAR_WIDTH_PX}px`,
      transform: `translateX(-${SIDEBAR_WIDTH_PX}px)`,
      opacity: 0,
    },
  },
})

export const sidebarHeaderStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  height: '52px',
  padding: '8px',
  flexShrink: 0,
})

export const sidebarHeaderCollapsedStyle = css({
  justifyContent: 'center',
  padding: '8px 6px',
})

export const iconButtonStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  padding: 0,
  width: '36px',
  height: '36px',
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
})

export const sidebarHomeLinkStyle = css({
  '&[data-collapsed="true"]': { display: 'none' },
})

export const sidebarNavStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  padding: '8px 6px 0',
})

/** Conversation list — the sidebar's internal scroller (header/footer/account stay pinned). */
export const sidebarConversationsStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  padding: '8px 6px 0',
  flex: '1 1 auto',
  minHeight: 0,
  overflowY: 'auto',
})

export const sidebarSpacerStyle = css({ flex: '1 1 auto', minHeight: '24px' })

export const sidebarFooterNavStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '1px',
  padding: '12px 6px 6px',
  '&[data-collapsed="true"]': { display: 'none' },
})

export const sidebarItemStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
  minHeight: '36px',
  padding: '7.5px 10px 8.5px',
  transition:
    'background-color 150ms var(--home-ease-out), color 150ms var(--home-ease-out), padding 320ms var(--home-ease-out), gap 320ms var(--home-ease-out)',
  borderRadius: '10px',
  color: 'var(--home-fg)',
  textDecoration: 'none',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
})

export const sidebarItemActiveStyle = css({ background: 'var(--home-surface)' })

export const sidebarItemLabelStyle = css({
  flex: '1 1 auto',
  minWidth: 0,
  maxWidth: '200px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  opacity: 1,
  transition: SIDEBAR_LABEL_TRANSITION,
})

/** Inline rename input — swaps in for the label span while `editingId === row.id`. */
export const sidebarItemRenameInputStyle = css({
  flex: '1 1 auto',
  minWidth: 0,
  maxWidth: '200px',
  margin: 0,
  padding: '1px 5px',
  font: 'inherit',
  color: 'inherit',
  background: 'transparent',
  border: '1px solid var(--home-border-strong)',
  borderRadius: '6px',
  outline: 'none',
  '&:focus-visible': { borderColor: 'var(--home-fg)' },
})

export const sidebarCtaStyle = css({
  marginTop: 'auto',
  padding: '21px 20px 20px',
  borderTop: '1px solid var(--home-border-strong)',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  '&[data-collapsed="true"]': { display: 'none' },
})

export const ctaTitleStyle = css({
  margin: 0,
  fontWeight: 700,
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
})

export const ctaBodyStyle = css({
  margin: 0,
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-muted)',
})

export const ctaButtonStyle = css({
  appearance: 'none',
  width: '100%',
  minHeight: '44px',
  padding: '12px 17px',
  borderRadius: '9999px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-bg)',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  cursor: 'pointer',
  transition:
    'background-color 150ms var(--home-ease-out), border-color 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover, &:focus-visible': {
    background: 'var(--home-surface)',
    outline: 'none',
  },
  '&:active': { transform: 'scale(0.98)' },
})

export const sidebarSectionLabelStyle = css({
  margin: '8px 10px 4px',
  fontSize: '12px',
  lineHeight: '16px',
  color: 'var(--home-muted)',
  '&[data-collapsed="true"]': { display: 'none' },
})

export const accountWrapStyle = css({
  position: 'relative',
  flexShrink: 0,
  padding: '8px 6px 10px',
  '&[data-collapsed="true"]': { display: 'none' },
})

export const accountTriggerStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '44px',
  padding: '6px 8px',
  borderRadius: '12px',
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
  '&[aria-expanded="true"]': { background: 'var(--home-surface)' },
})

export const accountAvatarStyle = css({
  flexShrink: 0,
  width: '32px',
  height: '32px',
  minWidth: '32px',
  minHeight: '32px',
  borderRadius: '9999px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--home-fg)',
  color: 'var(--home-bg)',
  fontSize: '12px',
  fontWeight: 600,
  lineHeight: '16px',
  letterSpacing: '0.02em',
  objectFit: 'cover',
})

export const accountNameStyle = css({
  flex: '1 1 auto',
  minWidth: 0,
  maxWidth: '180px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '14px',
  lineHeight: '20px',
  fontWeight: 500,
  opacity: 1,
  transition: SIDEBAR_LABEL_TRANSITION,
})

export const accountMenuStyle = css({
  position: 'absolute',
  left: '6px',
  right: '6px',
  bottom: 'calc(100% - 4px)',
  zIndex: 60,
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '8px',
  borderRadius: '16px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-bg)',
  boxShadow: '0 8px 28px rgba(0, 0, 0, 0.12)',
  overflow: 'hidden',
  // Author `display: flex` would override UA `[hidden] { display: none }` — toggle via data-open.
  '&[data-open="false"]': { display: 'none' },
})

export const accountMenuHeaderStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  padding: '8px 8px 10px',
  borderBottom: '1px solid var(--home-border)',
  marginBottom: '4px',
})

export const accountMenuItemStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '40px',
  padding: '8px 10px',
  borderRadius: '10px',
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'left',
  textDecoration: 'none',
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
})

export const accountMenuItemDisabledStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '10px',
  minHeight: '40px',
  padding: '8px 10px',
  borderRadius: '10px',
  background: 'transparent',
  color: 'var(--home-muted)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'left',
  cursor: 'not-allowed',
  opacity: 0.72,
})

export const accountMenuItemLabelStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  minWidth: 0,
})

export const accountMenuSoonStyle = css({
  fontSize: '11px',
  lineHeight: '14px',
  color: 'var(--home-muted)',
  whiteSpace: 'nowrap',
})

export const accountMenuLogoutFormStyle = css({
  margin: 0,
  paddingTop: '4px',
  borderTop: '1px solid var(--home-border)',
})

/* Settings Modal — §3.5 Account surfaces; grayscale shell skin; glass approx. */
export const settingsModalOverlayStyle = css({
  position: 'fixed',
  inset: 0,
  zIndex: 100,
  background: 'rgba(13, 13, 13, 0.32)',
  backdropFilter: 'blur(2px)',
  WebkitBackdropFilter: 'blur(2px)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '24px',
  opacity: 0,
  pointerEvents: 'none',
  transition: 'opacity 200ms var(--home-ease-out)',
  '@media (prefers-reduced-transparency: reduce)': {
    background: 'rgba(13, 13, 13, 0.48)',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
  // Scope 3b mobile: inset card — keep margins so dimmed backdrop shows
  '@media (max-width: 900px)': { padding: '16px' },
  '&[data-open="true"]': {
    opacity: 1,
    pointerEvents: 'auto',
  },
})

export const settingsModalBodyStyle = css({
  display: 'flex',
  flex: '1 1 auto',
  minHeight: '360px',
  overflow: 'hidden',
  // Scope 3 mobile: nav stacks above content
  '@media (max-width: 900px)': { flexDirection: 'column', overflow: 'visible' },
})

export const settingsModalStyle = css({
  position: 'relative',
  width: '100%',
  maxWidth: '720px',
  maxHeight: '85vh',
  minHeight: '420px',
  background: 'var(--home-bg)',
  border: '1px solid var(--home-border-strong)',
  borderRadius: '16px',
  boxShadow: '0 8px 12px rgba(0, 0, 0, 0.08), 0 0 1px rgba(0, 0, 0, 0.62)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  // Glass approximation — subtle inset highlight + hairline
  '&::before': {
    content: '""',
    position: 'absolute',
    inset: 0,
    borderRadius: '16px',
    border: '1px solid rgba(255, 255, 255, 0.08)',
    pointerEvents: 'none',
  },
  '@media (prefers-reduced-transparency: reduce)': {
    background: 'var(--home-bg)',
    '&::before': { display: 'none' },
  },
  // Scope 3b mobile: inset centered card (not full-bleed)
  '@media (max-width: 900px)': {
    maxWidth: '100%',
    maxHeight: 'min(85vh, calc(100% - 32px))',
    height: 'auto',
    borderRadius: '20px',
    '&::before': { borderRadius: '20px' },
  },
  // Entrance animation via animateMenuFade (opacity only)
})

export const settingsModalSearchStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '8px 14px',
  borderRadius: '9999px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-bg)',
  color: 'var(--home-muted)',
  marginBottom: '6px',
  transition: 'border-color 150ms var(--home-ease-out), box-shadow 150ms var(--home-ease-out)',
  '&:focus-within': { borderColor: 'var(--home-fg)', boxShadow: '0 0 0 3px rgba(13, 13, 13, 0.12)' },
})

export const settingsModalSearchInputStyle = css({
  appearance: 'none',
  border: 0,
  outline: 'none',
  flex: '1 1 auto',
  minWidth: 0,
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  '&::placeholder': { color: 'var(--home-muted)' },
})

export const settingsModalSrOnlyStyle = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
})

// Scope 3 mobile: dialog title becomes visible top-left; sr-only on desktop (≥901)
export const settingsModalTitleStyle = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  margin: '-1px',
  padding: 0,
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
  '@media (max-width: 900px)': {
    position: 'static',
    width: 'auto',
    height: 'auto',
    margin: 0,
    padding: '14px 16px',
    overflow: 'visible',
    clip: 'auto',
    whiteSpace: 'normal',
    flexShrink: 0,
    fontSize: '18px',
    lineHeight: '28px',
    fontWeight: 600,
    color: 'var(--home-fg)',
  },
})

export const settingsModalRowStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '16px',
  padding: '12px 0',
  borderBottom: '1px solid var(--home-border)',
  '&:last-child': { borderBottom: 'none' },
})

export const settingsModalRowLabelStyle = css({
  flexShrink: 0,
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
})

export const settingsModalCloseStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  padding: '8px',
  width: '36px',
  height: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '10px',
  background: 'transparent',
  color: 'var(--home-fg)',
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
  // Scope 3 mobile: X escapes nav flow to top-right of modal shell
  '@media (max-width: 900px)': {
    position: 'absolute',
    top: '10px',
    right: '10px',
    zIndex: 1,
  },
})

export const settingsModalNavStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  padding: '12px',
  width: '210px',
  minWidth: '180px',
  maxWidth: '210px',
  flexShrink: 0,
  borderRight: '1px solid var(--home-border)',
  background: 'var(--home-surface)',
  overflowY: 'auto',
  // Scope 3 mobile: full-width column; hairline under nav instead of right rail
  '@media (max-width: 900px)': {
    width: '100%',
    minWidth: 0,
    maxWidth: '100%',
    flexShrink: 0,
    borderRight: 'none',
    borderBottom: '1px solid var(--home-border)',
    overflow: 'visible',
    padding: '0 16px 8px',
    background: 'transparent',
  },
})

// Wrapper for nav item buttons. Desktop: display:contents (buttons behave as
// direct nav children, unchanged scope 2). Mobile: horizontal scroll row.
export const settingsModalNavItemsStyle = css({
  display: 'contents',
  '@media (max-width: 900px)': {
    display: 'flex',
    flexDirection: 'row',
    gap: '6px',
    overflowX: 'auto',
    WebkitOverflowScrolling: 'touch',
    width: '100%',
  },
})

export const settingsModalNavItemStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: '10px',
  minHeight: '36px',
  padding: '8px 12px',
  borderRadius: '10px',
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  textAlign: 'left',
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-bg)', outline: 'none' },
  // Scope 3 mobile: shrink-wrap in horizontal nav row
  '@media (max-width: 900px)': {
    width: 'auto',
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
})

export const settingsModalNavItemActiveStyle = css({
  background: 'rgba(0, 0, 0, 0.04)',
  color: 'var(--home-fg)',
})

export const settingsModalContentStyle = css({
  flex: '1 1 auto',
  padding: '24px',
  overflowY: 'auto',
  minWidth: 0,
})

export const settingsModalSectionStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
})

export const settingsModalSectionTitleStyle = css({
  margin: '0 0 8px',
  fontSize: '18px',
  lineHeight: '28px',
  fontWeight: 600,
  color: 'var(--home-fg)',
})

export const settingsModalFieldStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
})

export const settingsModalLabelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '6px',
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
})

export const settingsModalInputStyle = css({
  appearance: 'none',
  width: '100%',
  minHeight: '40px',
  padding: '8px 12px',
  borderRadius: '10px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-bg)',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  outline: 'none',
  transition: 'border-color 150ms var(--home-ease-out), box-shadow 150ms var(--home-ease-out)',
  '&:focus-visible': { borderColor: 'var(--home-fg)', boxShadow: '0 0 0 3px rgba(13, 13, 13, 0.12)' },
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
  '&::placeholder': { color: 'var(--home-muted)' },
})

export const settingsModalInputHintStyle = css({
  margin: 0,
  fontSize: '12px',
  lineHeight: '16px',
  color: 'var(--home-muted)',
})

export const settingsModalKeyMaskStyle = css({
  marginTop: '4px',
  fontSize: '12px',
  lineHeight: '16px',
  color: 'var(--home-subtle)',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
})

export const settingsModalAlertErrorStyle = css({
  color: 'var(--home-fg)',
  background: 'rgba(220, 38, 38, 0.12)',
  border: '1px solid rgba(220, 38, 38, 0.3)',
  borderRadius: '8px',
  padding: '10px 12px',
  marginTop: '8px',
  fontSize: '13px',
  lineHeight: '18px',
})

export const settingsModalAlertSuccessStyle = css({
  color: 'var(--home-fg)',
  background: 'rgba(22, 163, 74, 0.12)',
  border: '1px solid rgba(22, 163, 74, 0.3)',
  borderRadius: '8px',
  padding: '10px 12px',
  marginTop: '8px',
  fontSize: '13px',
  lineHeight: '18px',
})

export const settingsModalButtonStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  minHeight: '40px',
  padding: '10px 18px',
  borderRadius: '9999px',
  background: 'var(--home-fg)',
  color: 'var(--home-bg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover:not(:disabled), &:focus-visible:not(:disabled)': { background: 'var(--home-subtle)', outline: 'none' },
  '&:active:not(:disabled)': { transform: 'scale(0.98)' },
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
})

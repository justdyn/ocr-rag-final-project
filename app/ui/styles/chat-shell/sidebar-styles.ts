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
    height: '100vh',
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
  minHeight: '100vh',
  background: 'var(--home-bg)',
  borderRight: '1px solid var(--home-border)',
  transform: 'translateX(0)',
  opacity: 1,
  transition: SIDEBAR_TRANSITION,
  willChange: 'width, transform, opacity',
  '&[data-open="false"]': {
    width: `${SIDEBAR_COLLAPSED_WIDTH_PX}px`,
    '& [data-sidebar-label]': {
      opacity: 0,
      maxWidth: 0,
      overflow: 'hidden',
      pointerEvents: 'none',
      transition: SIDEBAR_LABEL_TRANSITION,
    },
    '& [data-sidebar-item]': {
      justifyContent: 'center',
      gap: 0,
      paddingLeft: 0,
      paddingRight: 0,
    },
    '& [data-sidebar-nav]': {
      paddingLeft: '6px',
      paddingRight: '6px',
    },
  },
  [`@media (max-width: ${SIDEBAR_MOBILE_MAX_PX}px)`]: {
    minHeight: '100vh',
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

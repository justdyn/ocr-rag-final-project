import { css } from 'remix/ui'

import { SIDEBAR_MOBILE_MAX_PX } from '../../../utils/chat-shell-sidebar.ts'

/** Grayscale Library panel styles (§3.5 shell language). */

export const libraryRootStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  width: '100%',
  color: 'var(--home-fg)',
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
})

export const libraryToolbarStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '12px',
})

export const librarySearchWrapStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  flex: '1 1 220px',
  minWidth: '160px',
  maxWidth: '360px',
  height: '40px',
  padding: '0 14px',
  borderRadius: '9999px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-surface)',
  color: 'var(--home-muted)',
})

export const librarySearchInputStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  padding: 0,
  flex: '1 1 auto',
  minWidth: 0,
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  outline: 'none',
  '&::placeholder': { color: 'var(--home-subtle)' },
})

export const libraryNewButtonStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  height: '40px',
  padding: '0 16px',
  borderRadius: '9999px',
  background: '#0d0d0d',
  color: '#fff',
  font: 'inherit',
  fontSize: '14px',
  fontWeight: 600,
  cursor: 'pointer',
  transition: 'opacity 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { opacity: 0.88, outline: 'none' },
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
})

export const libraryTabsStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  flexWrap: 'wrap',
})

export const libraryTabStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  padding: '8px 14px',
  borderRadius: '9999px',
  background: 'transparent',
  color: 'var(--home-muted)',
  font: 'inherit',
  fontSize: '14px',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out), color 150ms var(--home-ease-out)',
  '&:hover, &:focus-visible': {
    background: 'var(--home-surface)',
    color: 'var(--home-fg)',
    outline: 'none',
  },
})

export const libraryTabActiveStyle = css({
  background: 'var(--home-surface)',
  color: 'var(--home-fg)',
})

export const libraryTableStyle = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  border: '1px solid var(--home-border)',
  borderRadius: '10px',
  overflow: 'hidden',
  background: '#fff',
})

export const libraryHeaderRowStyle = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 160px 40px',
  gap: '12px',
  alignItems: 'center',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--home-muted)',
  background: 'var(--home-surface)',
  borderBottom: '1px solid var(--home-border)',
})

export const libraryRowStyle = css({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 160px 40px',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 12px',
  borderBottom: '1px solid var(--home-border)',
  borderRadius: 0,
  transition: 'background-color 120ms var(--home-ease-out)',
  '&:last-child': { borderBottom: 0 },
  '&:hover, &:focus-within': {
    background: 'var(--home-surface)',
  },
})

export const libraryFooterStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '12px',
  padding: '10px 12px',
  borderTop: '1px solid var(--home-border)',
  background: '#fff',
  fontSize: '13px',
  color: 'var(--home-muted)',
})

export const libraryFooterMetaStyle = css({
  margin: 0,
  whiteSpace: 'nowrap',
})

export const libraryFooterControlsStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '12px',
  marginLeft: 'auto',
})

export const libraryRowsPerPageStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
  color: 'var(--home-muted)',
  fontSize: '13px',
})

export const librarySelectStyle = css({
  appearance: 'none',
  margin: 0,
  height: '32px',
  padding: '0 28px 0 10px',
  borderRadius: '6px',
  border: '1px solid var(--home-border-strong)',
  background:
    'var(--home-surface) url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'12\' height=\'12\' viewBox=\'0 0 24 24\' fill=\'none\' stroke=\'%23666\' stroke-width=\'2\'%3E%3Cpath d=\'m6 9 6 6 6-6\'/%3E%3C/svg%3E") no-repeat right 8px center',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '13px',
  cursor: 'pointer',
  outline: 'none',
  '&:focus-visible': { borderColor: 'var(--home-fg)' },
})

export const libraryPaginationStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '4px',
  [`@media (max-width: ${SIDEBAR_MOBILE_MAX_PX}px)`]: {
    // Icon-only Prev/Next on mobile: the word hides, the chevron + aria-label stay.
    '& [data-library-page-label]': { display: 'none' },
  },
})

export const libraryPageButtonStyle = css({
  appearance: 'none',
  border: '1px solid transparent',
  margin: 0,
  minWidth: '32px',
  height: '32px',
  padding: '0 8px',
  borderRadius: '6px',
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '13px',
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '4px',
  whiteSpace: 'nowrap',
  flexShrink: 0,
  transition: 'background-color 120ms var(--home-ease-out), border-color 120ms var(--home-ease-out)',
  '&:hover:not(:disabled), &:focus-visible:not(:disabled)': {
    background: 'var(--home-surface)',
    outline: 'none',
  },
  '&:disabled': {
    opacity: 0.4,
    cursor: 'not-allowed',
    color: 'var(--home-subtle)',
  },
})

export const libraryPageButtonActiveStyle = css({
  borderColor: 'var(--home-border-strong)',
  background: 'var(--home-surface)',
})

export const libraryPageEllipsisStyle = css({
  minWidth: '24px',
  textAlign: 'center',
  color: 'var(--home-subtle)',
  userSelect: 'none',
})

export const libraryNameCellStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
  minWidth: 0,
})

export const libraryFileIconStyle = css({
  flexShrink: 0,
  width: '32px',
  height: '32px',
  borderRadius: '6px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: '11px',
  fontWeight: 700,
  letterSpacing: '0.02em',
  color: '#fff',
  background: '#5b5b5b',
  '&[data-kind="pdf"]': { background: '#d94a4a' },
  '&[data-kind="doc"]': { background: '#2b6cb0' },
  '&[data-kind="image"]': { background: '#b44d8a' },
})

export const libraryFilenameStyle = css({
  margin: 0,
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const libraryActivityStyle = css({
  margin: 0,
  fontSize: '13px',
  lineHeight: '18px',
  color: 'var(--home-muted)',
  whiteSpace: 'nowrap',
})

export const libraryStatusStyle = css({
  margin: 0,
  fontSize: '12px',
  lineHeight: '16px',
  color: 'var(--home-subtle)',
})

export const libraryMoreButtonStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '32px',
  height: '32px',
  borderRadius: '8px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  color: 'var(--home-muted)',
  cursor: 'pointer',
  opacity: 0,
  transition: 'opacity 120ms var(--home-ease-out), background-color 120ms var(--home-ease-out)',
  '[data-library-row]:hover &, [data-library-row]:focus-within &, &:focus-visible': {
    opacity: 1,
    outline: 'none',
  },
  '&:hover, &:focus-visible': {
    background: 'var(--home-border)',
    color: 'var(--home-fg)',
  },
})

export const libraryMenuStyle = css({
  position: 'absolute',
  right: '8px',
  top: 'calc(100% - 4px)',
  zIndex: 5,
  minWidth: '160px',
  padding: '6px',
  borderRadius: '12px',
  border: '1px solid var(--home-border-strong)',
  background: '#fff',
  boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
})

export const libraryMenuItemStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '100%',
  textAlign: 'left',
  padding: '8px 10px',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  cursor: 'pointer',
  '&:hover, &:focus-visible': {
    background: 'var(--home-surface)',
    outline: 'none',
  },
  '&[data-danger="true"]': { color: '#b42318' },
})

export const libraryEmptyStyle = css({
  margin: '32px 0',
  textAlign: 'center',
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-muted)',
})

export const libraryNoticeStyle = css({
  margin: 0,
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-surface)',
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
})

export const libraryHiddenInputStyle = css({
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: 0,
  margin: '-1px',
  overflow: 'hidden',
  clip: 'rect(0, 0, 0, 0)',
  whiteSpace: 'nowrap',
  border: 0,
})

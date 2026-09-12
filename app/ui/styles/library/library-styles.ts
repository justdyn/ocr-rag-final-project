import { css } from 'remix/ui'

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
  borderTop: '1px solid var(--home-border)',
})

export const libraryHeaderRowStyle = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 160px 40px',
  gap: '12px',
  alignItems: 'center',
  padding: '10px 8px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--home-muted)',
  borderBottom: '1px solid var(--home-border)',
})

export const libraryRowStyle = css({
  position: 'relative',
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 160px 40px',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 8px',
  borderBottom: '1px solid var(--home-border)',
  borderRadius: '8px',
  transition: 'background-color 120ms var(--home-ease-out)',
  '&:hover, &:focus-within': {
    background: 'var(--home-surface)',
  },
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

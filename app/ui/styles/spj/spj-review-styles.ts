import { css } from 'remix/ui'

/** SPJ Review panel styles (grayscale shell language, §3.5). */

export const spjReviewRootStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '20px',
  width: '100%',
  color: 'var(--home-fg)',
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
})

export const spjReviewHeaderStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  flexWrap: 'wrap',
  gap: '12px',
  paddingBottom: '12px',
  borderBottom: '1px solid var(--home-border)',
})

export const spjReviewTitleStyle = css({
  margin: 0,
  fontSize: '20px',
  fontWeight: 600,
  lineHeight: '28px',
  letterSpacing: '-0.27px',
  color: 'var(--home-fg)',
})

export const spjReviewActionsStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  gap: '8px',
})

export const spjReviewConfirmStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  minHeight: '36px',
  padding: '8px 16px',
  borderRadius: '9999px',
  background: 'var(--home-fg)',
  color: 'var(--home-bg)',
  font: 'inherit',
  fontSize: '14px',
  fontWeight: 600,
  lineHeight: '20px',
  cursor: 'pointer',
  transition: 'opacity 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover:not(:disabled), &:focus-visible:not(:disabled)': { opacity: 0.88, outline: 'none' },
  '&:active:not(:disabled)': { transform: 'scale(0.98)' },
  '&:disabled': { opacity: 0.5, cursor: 'not-allowed' },
})

export const spjReviewDownloadStyle = css({
  appearance: 'none',
  margin: 0,
  minHeight: '36px',
  padding: '8px 16px',
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
    'background-color 150ms var(--home-ease-out), transform 120ms var(--home-ease-out), opacity 120ms var(--home-ease-out)',
  '&:hover:not(:disabled), &:focus-visible:not(:disabled)': { background: 'var(--home-surface)', outline: 'none' },
  '&:active:not(:disabled)': { transform: 'scale(0.98)' },
  '&:disabled, &[data-disabled="true"]': { opacity: 0.4, cursor: 'not-allowed', color: 'var(--home-subtle)', pointerEvents: 'none' },
})

export const spjReviewTableStyle = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  border: '1px solid var(--home-border)',
  borderRadius: '10px',
  overflow: 'hidden',
  background: '#fff',
})

export const spjReviewHeaderRowStyle = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 80px 120px 120px',
  gap: '12px',
  alignItems: 'center',
  padding: '10px 12px',
  fontSize: '13px',
  fontWeight: 500,
  color: 'var(--home-muted)',
  background: 'var(--home-surface)',
  borderBottom: '1px solid var(--home-border)',
})

export const spjReviewRowStyle = css({
  display: 'grid',
  gridTemplateColumns: 'minmax(0, 1fr) 80px 120px 120px',
  gap: '12px',
  alignItems: 'center',
  padding: '12px 12px',
  borderBottom: '1px solid var(--home-border)',
  borderRadius: 0,
  transition: 'background-color 120ms var(--home-ease-out)',
  '&:last-child': { borderBottom: 0 },
  '&:hover': { background: 'var(--home-surface)' },
})

export const spjReviewCellDescStyle = css({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
})

export const spjReviewDescStyle = css({
  margin: 0,
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
})

export const spjReviewCellNumberStyle = css({
  margin: 0,
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
  fontVariantNumeric: 'tabular-nums',
  textAlign: 'right',
  whiteSpace: 'nowrap',
})

export const spjReviewTotalStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'flex-end',
  gap: '12px',
  padding: '16px 12px',
  fontSize: '15px',
  fontWeight: 600,
  lineHeight: '22px',
  color: 'var(--home-fg)',
  background: 'var(--home-surface)',
  borderTop: '1px solid var(--home-border)',
})

export const spjReviewTotalValueStyle = css({
  fontVariantNumeric: 'tabular-nums',
})

export const spjReviewEmptyStyle = css({
  margin: '32px 0',
  textAlign: 'center',
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-muted)',
})

export const spjReviewNoticeStyle = css({
  margin: 0,
  padding: '10px 12px',
  borderRadius: '10px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-surface)',
  fontSize: '14px',
  lineHeight: '20px',
  color: 'var(--home-fg)',
})
import { css } from 'remix/ui'

export const composerSectionStyle = css({
  flexShrink: 0,
  width: '100%',
  maxWidth: '100%',
  padding: 0,
})

/** Outer pill so the thumbnail strip sits above the input in the same chrome. */
export const composerPillStyle = css({
  display: 'flex',
  flexDirection: 'column',
  width: '100%',
  borderRadius: '28px',
  background: 'var(--home-bg)',
  boxShadow:
    '0 0 1px rgba(0, 0, 0, 0.62), 0 3px 6px rgba(0, 0, 0, 0.04), 0 4px 80px 8px rgba(0, 0, 0, 0.04)',
  transition: 'box-shadow 200ms var(--home-ease-out)',
  '&:focus-within': {
    boxShadow:
      '0 0 1px rgba(0, 0, 0, 0.72), 0 4px 12px rgba(0, 0, 0, 0.06), 0 8px 96px 12px rgba(0, 0, 0, 0.05)',
  },
})

export const composerFormStyle = css({
  display: 'grid',
  gridTemplateColumns: '36px minmax(0, 1fr) auto',
  alignItems: 'center',
  gap: '0 6px',
  width: '100%',
  minHeight: '52px',
  padding: '8px 10px',
})

export const composerIconBtnStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '36px',
  height: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '9999px',
  background: 'transparent',
  color: 'var(--home-fg)',
  cursor: 'pointer',
  transition: 'background-color 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { background: 'var(--home-surface)', outline: 'none' },
  '&:active': { transform: 'scale(0.94)' },
  '&:disabled': { opacity: 0.45, cursor: 'not-allowed' },
})

export const composerInputWrapStyle = css({
  display: 'flex',
  alignItems: 'center',
  minWidth: 0,
  minHeight: '36px',
})

export const composerInputStyle = css({
  width: '100%',
  minHeight: '24px',
  maxHeight: '200px',
  padding: '6px',
  border: 0,
  resize: 'none',
  background: 'transparent',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  outline: 'none',
  '&::placeholder': { color: 'var(--home-muted)' },
})

export const composerActionsStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '6px',
})

export const sendButtonStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '36px',
  height: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '9999px',
  background: '#000000',
  color: '#ffffff',
  cursor: 'pointer',
  transition: 'opacity 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { opacity: 0.88, outline: 'none' },
  '&:active': { transform: 'scale(0.94)' },
})

/** Grayscale status line under the composer — §3.5 shell skin, not DocIntel tokens. */
export const composerFeedbackStyle = css({
  margin: '8px 12px 0',
  fontSize: '13px',
  lineHeight: '18px',
  color: 'var(--home-muted)',
  '& a': {
    color: 'var(--home-fg)',
    textUnderlineOffset: '2px',
  },
})

export const composerAttachStripStyle = css({
  display: 'flex',
  flexDirection: 'row',
  flexWrap: 'nowrap',
  gap: '8px',
  margin: 0,
  padding: '10px 12px 2px',
  listStyle: 'none',
  overflowX: 'auto',
})

export const composerThumbStyle = css({
  position: 'relative',
  flexShrink: 0,
  width: '56px',
  height: '56px',
  borderRadius: '12px',
  overflow: 'hidden',
  background: 'var(--home-surface)',
  border: '1px solid var(--home-border-strong)',
  '&[data-failed="true"]': { opacity: 0.72 },
  // Hide + hover-reveal must share this mixin. Each css() is @layer rmx.<hash>;
  // a later layer beats higher-specificity rules in an earlier one, so putting
  // opacity:0 on the button mixin made :hover { opacity:1 } here a no-op.
  '& [data-thumb-remove]': { opacity: 0 },
  '&:hover [data-thumb-remove], &:focus-within [data-thumb-remove]': {
    opacity: 1,
  },
})

export const composerThumbImgStyle = css({
  display: 'block',
  width: '100%',
  height: '100%',
  objectFit: 'cover',
})

export const composerThumbIconWrapStyle = css({
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '100%',
  height: '100%',
  color: 'var(--home-muted)',
})

export const composerThumbOverlayStyle = css({
  position: 'absolute',
  inset: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'rgba(13, 13, 13, 0.42)',
  pointerEvents: 'none',
})

/** Hover-revealed remove — CSS opacity only (no Framer Motion). §3.5 grayscale. */
export const composerThumbRemoveStyle = css({
  appearance: 'none',
  position: 'absolute',
  top: '4px',
  right: '4px',
  zIndex: 2,
  width: '20px',
  height: '20px',
  margin: 0,
  padding: 0,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  border: 0,
  borderRadius: '9999px',
  background: 'rgba(13, 13, 13, 0.78)',
  color: '#ffffff',
  cursor: 'pointer',
  transition: 'opacity 150ms var(--home-ease-out)',
  '&:focus-visible': {
    opacity: 1,
    outline: '2px solid #ffffff',
    outlineOffset: '1px',
  },
})

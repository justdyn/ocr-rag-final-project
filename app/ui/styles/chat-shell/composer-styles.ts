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
  overflow: 'hidden',
  // Stable frost under grayscale §3.5 (prd-chat-viewport CV-6): no
  // backdrop-filter — blur(24px) sampled the moving thread and animated
  // inside the pill. Near-opaque fill over the dock underlay reads as
  // glass (border + inset highlight + shadow) without live bleed.
  background: 'rgba(255, 255, 255, 0.96)',
  border: '1px solid rgba(255, 255, 255, 0.55)',
  boxShadow:
    '0 0 1px rgba(0, 0, 0, 0.5), 0 3px 6px rgba(0, 0, 0, 0.04), 0 4px 80px 8px rgba(0, 0, 0, 0.04), inset 0 1px 0 rgba(255, 255, 255, 0.65)',
  transition: 'box-shadow 200ms var(--home-ease-out)',
  '&:focus-within': {
    boxShadow:
      '0 0 1px rgba(0, 0, 0, 0.62), 0 4px 12px rgba(0, 0, 0, 0.06), 0 8px 96px 12px rgba(0, 0, 0, 0.05), inset 0 1px 0 rgba(255, 255, 255, 0.75)',
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

/** Click-to-preview target — fills the thumb behind the hover-revealed remove X. */
export const composerThumbOpenStyle = css({
  appearance: 'none',
  display: 'block',
  width: '100%',
  height: '100%',
  margin: 0,
  padding: 0,
  border: 0,
  background: 'transparent',
  cursor: 'pointer',
  font: 'inherit',
  '&:focus-visible': {
    outline: '2px solid var(--home-fg)',
    outlineOffset: '1px',
  },
})

/**
 * Preview lightbox. popover="auto" gives top layer + Escape/outside-click light dismiss.
 * Centering lives under &:popover-open — an unconditional author `display` would
 * override the UA's closed-popover display:none and blanket the page with the backdrop.
 */
export const composerPreviewBackdropStyle = css({
  position: 'fixed',
  inset: 0,
  width: '100%',
  height: '100%',
  margin: 0,
  border: 0,
  padding: 0,
  overflow: 'hidden',
  background: 'rgba(13, 13, 13, 0.55)',
  '&:popover-open': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '&::backdrop': { background: 'transparent' },
})

export const composerPreviewPanelStyle = css({
  display: 'flex',
  flexDirection: 'column',
  width: 'min(920px, calc(100vw - 32px))',
  height: 'min(82vh, 720px)',
  borderRadius: '16px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-bg)',
  overflow: 'hidden',
  boxShadow: '0 24px 64px rgba(0, 0, 0, 0.28)',
})

export const composerPreviewHeaderStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '8px',
  padding: '10px 12px',
  borderBottom: '1px solid var(--home-border)',
  flexShrink: 0,
})

export const composerPreviewTitleStyle = css({
  flex: 1,
  minWidth: 0,
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  fontSize: '13px',
  lineHeight: '18px',
  color: 'var(--home-fg)',
})

export const composerPreviewCloseStyle = css({
  appearance: 'none',
  width: '24px',
  height: '24px',
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
  flexShrink: 0,
  '&:focus-visible': {
    outline: '2px solid var(--home-fg)',
    outlineOffset: '1px',
  },
})

export const composerPreviewBodyStyle = css({
  flex: 1,
  minHeight: 0,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'var(--home-surface)',
  overflow: 'hidden',
})

export const composerPreviewImgStyle = css({
  display: 'block',
  maxWidth: '100%',
  maxHeight: '100%',
  objectFit: 'contain',
})

/** Native viewer chrome (zoom/download for PDFs, text for txt/md) comes free. */
export const composerPreviewFrameStyle = css({
  width: '100%',
  height: '100%',
  border: 0,
  background: '#ffffff',
})

import { css } from 'remix/ui'

import { SIDEBAR_DESKTOP_MIN_PX } from '../../../utils/chat-shell-sidebar.ts'

export const mainStyle = css({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minWidth: 0,
  // Anchor for in-thread absolute composer dock (glass over thread).
  position: 'relative',
  // No horizontal padding here — the thread scroller must be full-bleed so the
  // scrollbar sits on the main-panel right edge (ChatGPT pattern), not beside
  // the max-width message column. Padding lives on the centered inner column.
  overflow: 'hidden',
  // Picker open: header stacks above the dock (dock is sibling z-index 3) and
  // the composer is hidden so soft-keyboard search cannot collide with the list.
  '&[data-model-picker-open="true"] > header': {
    zIndex: 5,
  },
  '&[data-model-picker-open="true"] > [data-composer-dock]': {
    visibility: 'hidden',
    pointerEvents: 'none',
  },
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
  // Shared shell overlay (glassChrome): the bar leaves document flow so the
  // scroller runs full-height beneath it and content stays visible as it
  // passes under the chips. Non-glass headers stay in-flow.
  '&[data-glass="true"]': {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    background: 'transparent',
  },
})

/** Toggle + title share one flex row so the mobile open control never overlaps Remix. */
export const headerLeadingStyle = css({
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  minWidth: 0,
  flex: '1 1 auto',
})

/**
 * Shared shell header chip (data-glass="true") — solid page-color material:
 * opaque --home-bg fill, no hairline/ring/highlight/shadow. Hover and focus
 * are pinned to the same fill so the chip never flips material over the
 * transparent overlay bar; the base flat hover still serves non-glass chips.
 */
const glassChipSolid = {
  background: 'var(--home-bg)',
  boxShadow: 'none',
  '&:hover, &:focus-visible': { background: 'var(--home-bg)' },
}

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
  '&[data-glass="true"]': glassChipSolid,
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
  '&[data-glass="true"]': glassChipSolid,
})

export const modelSelectorWrapStyle = css({
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  maxWidth: 'min(420px, 70vw)',
})

export const modelDropdownStyle = css({
  position: 'absolute',
  top: 'calc(100% + 6px)',
  left: 0,
  zIndex: 40,
  width: 'min(360px, 86vw)',
  padding: '8px',
  borderRadius: '12px',
  border: '1px solid var(--home-border)',
  background: 'var(--home-bg)',
  boxShadow: '0 12px 40px rgba(15, 23, 42, 0.12)',
  display: 'none',
  flexDirection: 'column',
  gap: '8px',
  '&[data-open="true"]': { display: 'flex' },
})

export const modelSearchStyle = css({
  appearance: 'none',
  width: '100%',
  margin: 0,
  border: '1px solid var(--home-border)',
  borderRadius: '8px',
  padding: '8px 10px',
  background: 'var(--home-bg)',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  lineHeight: '20px',
  '&:focus-visible': { outline: '2px solid var(--home-fg)', outlineOffset: '1px' },
})

export const modelListStyle = css({
  // Cap at 280px on desktop; on short / keyboard-shrunk viewports fit under the
  // header (52) + gaps/search chrome (~144) so the list stays usable.
  maxHeight: 'min(280px, calc(100dvh - 52px - 144px))',
  overflowY: 'auto',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  '& [data-status]': {
    padding: '10px 8px',
    fontSize: '13px',
    color: 'var(--home-muted)',
  },
})

export const modelOptionStyle = css({
  appearance: 'none',
  border: 0,
  margin: 0,
  width: '100%',
  textAlign: 'left',
  display: 'flex',
  flexDirection: 'column',
  gap: '2px',
  padding: '8px 10px',
  borderRadius: '8px',
  background: 'transparent',
  color: 'var(--home-fg)',
  cursor: 'pointer',
  font: 'inherit',
  '&:hover, &:focus-visible': {
    background: 'var(--home-surface)',
    outline: 'none',
  },
  '&[data-selected="true"]': {
    background: 'var(--home-surface)',
  },
  '& > span:last-child': {
    fontSize: '12px',
    lineHeight: '16px',
    color: 'var(--home-muted)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
})

export const modelNameStyle = css({
  fontFamily: 'Inter, "Segoe UI", system-ui, sans-serif',
  fontWeight: 600,
  fontSize: '18px',
  lineHeight: '28px',
  letterSpacing: '-0.27px',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
  maxWidth: 'min(320px, 55vw)',
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
 * data-empty="true": stop growing and auto-margin above only — the matching
 * margin-bottom:auto lives on the dock (composerDockStyle) so hero and composer
 * stay adjacent and the pair is centered (ChatGPT empty home); in-thread the
 * region fills the panel and pins the dock to the bottom.
 */
export const chatScrollRegionStyle = css({
  flex: '1 1 auto',
  minHeight: 0,
  width: '100%',
  overflowY: 'auto',
  // Clear the overlay chips at rest (header is absolute when glassChrome);
  // also keeps empty-mode hero+composer centering identical to the in-flow
  // header it replaced. Content scrolls under the transparent bar.
  paddingTop: '52px',
  // Clear the absolute in-thread dock so the last bubbles stay readable.
  '&[data-empty="false"]': {
    // Dock stack ≈ gradient pad (28) + controls (44) + pill (54) + dock pad (20).
    paddingBottom: '162px',
  },
  '&[data-empty="true"]': {
    flex: '0 1 auto',
    marginTop: 'auto',
  },
})

/** Centered message / composer column inside the full-bleed scroller or dock. */
export const chatColumnStyle = css({
  width: '100%',
  maxWidth: '768px',
  margin: '0 auto',
  padding: '0 15px',
})

/**
 * Composer + controls + legal footer — always mounted.
 * Empty: in-flow with bottom auto-margin (pairs with region top auto-margin).
 * In-thread: absolute over the scroller so glass can refract message content
 * (not viewport `position: fixed` — see prd-chat-viewport).
 */
export const composerDockStyle = css({
  flexShrink: 0,
  width: '100%',
  // 20px bottom inset keeps the composer off the viewport edge (was 8px).
  padding: '0 0 20px',
  zIndex: 3,
  '&[data-empty="false"]': {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    marginBottom: 0,
    // Glass isolation (CV-6): px stops, fully opaque at 72px = the pill top
    // (28px pad + 44px controls, height-independent). Above that, a soft fade;
    // below it, the pill's backdrop-filter samples only this dock — never the
    // moving scroller content — so the glass reads stable.
    background:
      'linear-gradient(180deg, rgba(255, 255, 255, 0) 0px, rgba(255, 255, 255, 0.6) 40px, rgba(255, 255, 255, 1) 72px)',
    paddingTop: '28px',
  },
  '&[data-empty="true"]': {
    marginBottom: 'auto',
  },
})

/** Stack for ↓ fab + generating dots above the composer pill. */
export const dockControlsStyle = css({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '8px',
  width: '100%',
  marginBottom: '8px',
  minHeight: '36px',
  '&[data-empty="true"]': {
    display: 'none',
  },
})

export const scrollFabStyle = css({
  appearance: 'none',
  border: '1px solid rgba(0, 0, 0, 0.1)',
  margin: 0,
  width: '36px',
  height: '36px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  borderRadius: '9999px',
  background: 'rgba(255, 255, 255, 0.78)',
  backdropFilter: 'blur(16px) saturate(160%)',
  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
  color: 'var(--home-fg)',
  cursor: 'pointer',
  boxShadow: '0 2px 12px rgba(0, 0, 0, 0.08)',
  opacity: 0,
  transform: 'translateY(8px) scale(0.85)',
  pointerEvents: 'none',
  transition: 'background-color 150ms var(--home-ease-out)',
  // Visibility is CSS-driven (CV-4) so the fab stays clickable even when a
  // soft-nav re-render drops Framer's inline styles; animateScrollFab is a
  // spring enhancement on top.
  '&[data-visible="true"]': {
    opacity: 1,
    transform: 'none',
    pointerEvents: 'auto',
  },
  '&:hover, &:focus-visible': {
    background: 'rgba(255, 255, 255, 0.92)',
    outline: 'none',
  },
  '&:active': { transform: 'scale(0.96)' },
  '@media (prefers-reduced-transparency: reduce)': {
    background: 'var(--home-bg)',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
})

export const generatingIndicatorStyle = css({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '5px',
  height: '28px',
  padding: '0 12px',
  borderRadius: '9999px',
  background: 'rgba(255, 255, 255, 0.72)',
  backdropFilter: 'blur(16px) saturate(160%)',
  WebkitBackdropFilter: 'blur(16px) saturate(160%)',
  border: '1px solid rgba(255, 255, 255, 0.45)',
  boxShadow: '0 1px 8px rgba(0, 0, 0, 0.06)',
  opacity: 0,
  pointerEvents: 'none',
  visibility: 'hidden',
  '&[data-visible="true"]': {
    opacity: 1,
    visibility: 'visible',
  },
  '@media (prefers-reduced-transparency: reduce)': {
    background: 'var(--home-bg)',
    backdropFilter: 'none',
    WebkitBackdropFilter: 'none',
  },
})

export const generatingDotStyle = css({
  width: '6px',
  height: '6px',
  borderRadius: '9999px',
  background: 'var(--home-subtle)',
  opacity: 0.45,
  flexShrink: 0,
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

/**
 * Full-bleed scroller for AppShell content routes (same edge-scrollbar rule).
 * paddingTop clears the absolute glass header (52px) — same inset as chatScrollRegionStyle.
 */
export const mainContentWideStyle = css({
  display: 'flex',
  flexDirection: 'column',
  flex: '1 1 auto',
  minHeight: 0,
  width: '100%',
  overflowY: 'auto',
  padding: '52px 15px 32px',
})

export const contentPanelStyle = css({
  width: '100%',
  maxWidth: '960px',
  margin: '0 auto',
})

/** Profile view: fill scroller under glass inset and center children. */
export const contentPanelCenterStyle = css({
  flex: '1 1 auto',
  minHeight: 0,
  display: 'flex',
  flexDirection: 'column',
  justifyContent: 'center',
  alignItems: 'center',
})

/** Authenticated header trailing pill (e.g. Profile Edit). */
export const headerTrailingPillStyle = css({
  appearance: 'none',
  margin: 0,
  minHeight: '36px',
  padding: '8px 12px',
  borderRadius: '9999px',
  border: '1px solid var(--home-border-strong)',
  background: 'var(--home-bg)',
  color: 'var(--home-fg)',
  font: 'inherit',
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: '20px',
  cursor: 'pointer',
  textDecoration: 'none',
  display: 'inline-flex',
  alignItems: 'center',
  gap: '6px',
  transition: 'opacity 150ms var(--home-ease-out), transform 120ms var(--home-ease-out)',
  '&:hover, &:focus-visible': { opacity: 0.88, outline: 'none' },
  '&:focus-visible': { outline: '2px solid var(--home-fg)', outlineOffset: '2px' },
  '&:active': { transform: 'scale(0.98)' },
})

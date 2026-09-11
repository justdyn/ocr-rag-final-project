import { css } from 'remix/ui'

/**
 * Chat thread turn styles — ChatGPT-style conversation layout on the §3.5
 * grayscale shell skin (user pill + flush assistant prose, no bordered cards).
 */

/** User turn row — right-aligns the pill inside the thread column. */
export const userRowStyle = css({
  display: 'flex',
  justifyContent: 'flex-end',
})

/** User pill — 24px radius reads as a pill single-line and stays calm multi-line. */
export const userPillStyle = css({
  maxWidth: '80%',
  padding: '10px 16px',
  borderRadius: '24px',
  background: 'var(--home-surface)',
  color: 'var(--home-fg)',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
})

export const userTextStyle = css({
  margin: 0,
  fontSize: '15px',
  lineHeight: '24px',
})

/** Assistant turn — full-width row; prose sits directly on the page background. */
export const assistantRowStyle = css({
  display: 'flex',
  flexDirection: 'column',
})

export const assistantProseStyle = css({
  // Markdown blocks own their spacing/whitespace (md* styles below); the
  // container only sets type color/size so user-content escaping stays safe.
  fontSize: '15px',
  lineHeight: '26px',
  color: 'var(--home-fg)',
})

/** Quiet streaming placeholder. */
export const assistantPendingStyle = css({
  color: 'var(--home-subtle)',
})

/** Attachment thumbs inside the user pill, above the text (composer tile shape). */
export const userAttachmentRowStyle = css({
  display: 'flex',
  flexWrap: 'wrap',
  gap: '8px',
  margin: '0 0 8px',
  padding: 0,
  listStyle: 'none',
})

export const messageThumbStyle = css({
  flexShrink: 0,
  width: '56px',
  height: '56px',
  borderRadius: '12px',
  overflow: 'hidden',
  background: 'var(--home-surface)',
  border: '1px solid var(--home-border-strong)',
})

/** Non-image attachment detail card inside the popover panel (body child). */
export const messageMetaCardStyle = css({
  width: '100%',
  height: '100%',
  boxSizing: 'border-box',
  overflowY: 'auto',
  padding: '18px 20px',
  display: 'flex',
  flexDirection: 'column',
  gap: '16px',
  background: 'var(--home-bg)',
  color: 'var(--home-fg)',
})

export const messageMetaRowsStyle = css({
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  margin: 0,
  padding: 0,
})

export const messageMetaRowStyle = css({
  display: 'flex',
  alignItems: 'baseline',
  gap: '8px',
  margin: 0,
})

export const messageMetaLabelStyle = css({
  flexShrink: 0,
  width: '120px',
  margin: 0,
  fontSize: '12px',
  lineHeight: '18px',
  color: 'var(--home-muted)',
})

export const messageMetaValueStyle = css({
  margin: 0,
  fontSize: '13px',
  lineHeight: '18px',
  color: 'var(--home-fg)',
  overflowWrap: 'anywhere',
})

/** Extracted-text excerpt — pre-wrap, own scroll; subtree opts out of Lenis. */
export const messageMetaExcerptStyle = css({
  margin: 0,
  padding: '10px 12px',
  background: 'var(--home-surface)',
  borderRadius: '8px',
  border: '1px solid var(--home-border)',
  fontFamily: 'inherit',
  fontSize: '12px',
  lineHeight: '18px',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  maxHeight: '200px',
  overflowY: 'auto',
  color: 'var(--home-fg)',
})

/**
 * Markdown prose styles for assistant replies (markdown-render.tsx).
 * Blocks replace the old pre-wrap catch-all: paragraphs keep pre-wrap so
 * soft line breaks survive streaming, everything else is structured markup.
 */

export const mdParagraphStyle = css({
  margin: '0 0 12px',
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
})

export const mdHeadingStyle = css({
  margin: '20px 0 8px',
  fontSize: '16px',
  lineHeight: '24px',
  fontWeight: 600,
})

export const mdSubHeadingStyle = css({
  margin: '16px 0 6px',
  fontSize: '15px',
  lineHeight: '22px',
  fontWeight: 600,
})

export const mdListStyle = css({
  margin: '0 0 12px',
  paddingInlineStart: '24px',
})

export const mdListItemStyle = css({
  margin: '0 0 4px',
})

export const mdCodeBlockStyle = css({
  margin: '0 0 12px',
  padding: '12px 14px',
  background: 'var(--home-surface)',
  border: '1px solid var(--home-border)',
  borderRadius: '8px',
  overflowX: 'auto',
  fontFamily: 'ui-monospace, monospace',
  fontSize: '13px',
  lineHeight: '20px',
  whiteSpace: 'pre',
})

export const mdInlineCodeStyle = css({
  padding: '1px 5px',
  background: 'var(--home-surface)',
  borderRadius: '4px',
  fontFamily: 'ui-monospace, monospace',
  fontSize: '13px',
})

export const mdBlockquoteStyle = css({
  margin: '0 0 12px',
  padding: '2px 0 2px 12px',
  borderLeft: '2px solid var(--home-border-strong)',
  color: 'var(--home-muted)',
})

export const mdTableWrapStyle = css({
  margin: '0 0 12px',
  overflowX: 'auto',
})

export const mdTableStyle = css({
  borderCollapse: 'collapse',
  fontSize: '14px',
  lineHeight: '20px',
})

export const mdThStyle = css({
  border: '1px solid var(--home-border-strong)',
  padding: '6px 10px',
  textAlign: 'left',
  fontWeight: 600,
})

export const mdTdStyle = css({
  border: '1px solid var(--home-border)',
  padding: '6px 10px',
  textAlign: 'left',
})

export const mdLinkStyle = css({
  color: 'inherit',
  textDecoration: 'underline',
})

export const mdHrStyle = css({
  border: 'none',
  borderTop: '1px solid var(--home-border)',
  margin: '16px 0',
})

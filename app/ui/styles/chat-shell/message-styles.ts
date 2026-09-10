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
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontSize: '15px',
  lineHeight: '26px',
  color: 'var(--home-fg)',
})

/** Quiet streaming placeholder. */
export const assistantPendingStyle = css({
  color: 'var(--home-subtle)',
})

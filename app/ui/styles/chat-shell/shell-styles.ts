import { css } from 'remix/ui'

import { EASE_OUT_PREMIUM } from '../../../utils/easing.ts'

export const shellStyle = css({
  '--home-bg': '#ffffff',
  '--home-fg': '#0d0d0d',
  '--home-muted': '#8f8f8f',
  '--home-subtle': '#5d5d5d',
  '--home-surface': '#f3f3f3',
  '--home-border': 'rgba(13, 13, 13, 0.05)',
  '--home-border-strong': 'rgba(0, 0, 0, 0.15)',
  '--home-ease-out': EASE_OUT_PREMIUM,
  '& *, & *::before, & *::after': { boxSizing: 'border-box' },
  '& .sr-only': {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    border: 0,
  },
  display: 'flex',
  // Viewport-bound shell: the document never scrolls — the full-bleed chat
  // region and the sidebar's conversation list own their own overflow-y.
  height: '100dvh',
  overflow: 'hidden',
  width: '100%',
  background: 'var(--home-bg)',
  color: 'var(--home-fg)',
  fontFamily: '"Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif',
  fontSize: '14px',
  lineHeight: '20px',
  WebkitFontSmoothing: 'antialiased',
  MozOsxFontSmoothing: 'grayscale',
})

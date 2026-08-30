/**
 * 28px SVG progress ring. CSS stroke-dashoffset transition — no Framer Motion.
 * Isolated in app/ui/chat-shell/ so composer ticks don't need a second animation stack.
 */
import { css, type Handle } from 'remix/ui'

import { circularProgressStroke } from '../../utils/circular-progress.ts'

const RING_RADIUS = 12
const RING_SIZE = 28
const VIEW = 32

const ringSvgStyle = css({
  display: 'block',
  transform: 'rotate(-90deg)',
  '&[data-spin="true"]': {
    animation: 'attach-ring-spin 0.8s linear infinite',
  },
  '@media (prefers-reduced-motion: reduce)': {
    '&[data-spin="true"]': { animation: 'none' },
  },
})

const ringTrackStyle = css({
  fill: 'none',
  stroke: 'rgba(255, 255, 255, 0.28)',
})

const ringValueStyle = css({
  fill: 'none',
  stroke: '#ffffff',
  strokeLinecap: 'round',
  transition: 'stroke-dashoffset 180ms linear',
  '@media (prefers-reduced-motion: reduce)': {
    transition: 'none',
  },
})

export type CircularProgressProps = {
  fraction: number
  indeterminate?: boolean
}

export function CircularProgress(handle: Handle<CircularProgressProps>) {
  return () => {
    let fraction = handle.props.indeterminate ? 0.25 : handle.props.fraction
    let { circumference, dashoffset } = circularProgressStroke(fraction, RING_RADIUS)
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={RING_SIZE}
        height={RING_SIZE}
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        aria-hidden="true"
        data-spin={handle.props.indeterminate ? 'true' : 'false'}
        mix={ringSvgStyle}
      >
        <circle cx={VIEW / 2} cy={VIEW / 2} r={RING_RADIUS} stroke-width="2.5" mix={ringTrackStyle} />
        <circle
          cx={VIEW / 2}
          cy={VIEW / 2}
          r={RING_RADIUS}
          stroke-width="2.5"
          stroke-dasharray={String(circumference)}
          stroke-dashoffset={String(dashoffset)}
          mix={ringValueStyle}
        />
      </svg>
    )
  }
}

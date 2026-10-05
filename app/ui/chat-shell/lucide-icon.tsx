import type { IconNode } from 'lucide'
import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import type { ShellLucideIconProps } from '../../utils/chat-shell-icons.ts'

/** Stable id for SVG remount when icon nodes change (avoids Remix index-key glyph merge). */
export function lucideIconSignature(nodes: IconNode): string {
  return nodes
    .map(([tag, attrs]) => {
      let tip =
        attrs.d ??
        attrs.points ??
        (attrs.cx != null ? `c${attrs.cx},${attrs.cy},${attrs.r}` : null) ??
        (attrs.x != null ? `x${attrs.x},${attrs.y},${attrs.width}` : null) ??
        (attrs.x1 != null ? `l${attrs.x1},${attrs.y1}` : '')
      return `${tag}:${tip}`
    })
    .join('|')
}

function nodeKey(tag: string, attrs: Record<string, unknown>, index: number): string {
  let tip =
    attrs.d ??
    attrs.points ??
    (attrs.cx != null ? `c${attrs.cx}` : null) ??
    (attrs.x != null ? `x${attrs.x}` : null) ??
    (attrs.x1 != null ? `l${attrs.x1}` : '')
  return `${tag}-${tip}-${index}`
}

function renderIconNodes(nodes: IconNode): RemixNode[] {
  return nodes.map(([tag, attrs], index) => {
    let key = nodeKey(tag, attrs as Record<string, unknown>, index)

    switch (tag) {
      case 'path':
        return <path key={key} d={String(attrs.d ?? '')} />
      case 'circle':
        return (
          <circle
            key={key}
            cx={attrs.cx}
            cy={attrs.cy}
            r={attrs.r}
          />
        )
      case 'line':
        return (
          <line
            key={key}
            x1={attrs.x1}
            y1={attrs.y1}
            x2={attrs.x2}
            y2={attrs.y2}
          />
        )
      case 'rect':
        return (
          <rect
            key={key}
            x={attrs.x}
            y={attrs.y}
            width={attrs.width}
            height={attrs.height}
            rx={attrs.rx}
            ry={attrs.ry}
          />
        )
      case 'polyline':
        return <polyline key={key} points={String(attrs.points ?? '')} />
      case 'polygon':
        return <polygon key={key} points={String(attrs.points ?? '')} />
      default:
        return null
    }
  })
}

export function LucideIcon(handle: Handle<ShellLucideIconProps>) {
  return () => {
    let size = handle.props.size ?? 20
    let strokeWidth = handle.props.strokeWidth ?? 2
    let icon = handle.props.icon
    let signature = lucideIconSignature(icon)

    return (
      <svg
        key={signature}
        xmlns="http://www.w3.org/2000/svg"
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width={strokeWidth}
        stroke-linecap="round"
        stroke-linejoin="round"
        aria-hidden="true"
        mix={css({
          display: 'block',
          width: `${size}px`,
          height: `${size}px`,
          flexShrink: 0,
        })}
      >
        {renderIconNodes(icon)}
      </svg>
    )
  }
}

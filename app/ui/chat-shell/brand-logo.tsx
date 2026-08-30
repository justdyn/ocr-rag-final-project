import type { Handle } from 'remix/ui'
import { css } from 'remix/ui'

export function BrandLogo(handle: Handle<{ src: string; size?: number; alt?: string }>) {
  let size = handle.props.size ?? 24
  let alt = handle.props.alt ?? ''

  return () => (
    <img
      src={handle.props.src}
      alt={alt}
      width={size}
      height={size}
      mix={css({
        display: 'block',
        width: `${size}px`,
        height: `${size}px`,
        flexShrink: 0,
        objectFit: 'contain',
      })}
    />
  )
}

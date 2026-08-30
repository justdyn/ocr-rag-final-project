import type { Handle, RemixNode } from 'remix/ui'
import { css } from 'remix/ui'

import { LenisRoot } from './lenis-root.tsx'
import { routes } from '../routes.ts'

export interface DocumentProps {
  children?: RemixNode
  head?: RemixNode
  title?: string
}

const DEFAULT_TITLE = readAppDisplayName('Frontend')

export function Document(handle: Handle<DocumentProps>) {
  return () => {
    let { children, head, title = DEFAULT_TITLE } = handle.props

    return (
      <html lang="en">
        <head>
          <meta charSet="utf-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1" />
          <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
          <link rel="stylesheet" href="/tailwind.css" />
          <title>{title}</title>
          {head}
        </head>
        <body mix={css({ margin: 0 })}>
          {/*
            LenisRoot is a sibling, not a wrapper: wrapping page trees as clientEntry
            children serializes `mix={css(...)}` descriptors without their `type` fn
            and crashes hydration (`descriptor.type is not a function`).
          */}
          {children}
          <LenisRoot />
          <script type="module" src={routes.assets.href({ path: 'app/assets/entry.ts' })}></script>
        </body>
      </html>
    )
  }
}

function readAppDisplayName(value: string): string {
  return value.startsWith('%%') ? 'Remix App' : decodeURIComponent(value)
}

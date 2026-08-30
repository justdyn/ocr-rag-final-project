import type { Handle } from 'remix/ui'

import { SHELL_COPY } from '../../utils/chat-shell-copy.ts'
import {
  ctaBodyStyle,
  ctaButtonStyle,
  ctaTitleStyle,
  sidebarCtaStyle,
} from '../styles/chat-shell/sidebar-styles.ts'
import { routes } from '../../routes.ts'

/** Always mounted — hide with data-collapsed so open/close never swaps the root tag. */
export function SidebarCta(handle: Handle<{ collapsed?: boolean }>) {
  return () => (
    <div
      data-collapsed={handle.props.collapsed ? 'true' : 'false'}
      mix={sidebarCtaStyle}
    >
      <p mix={ctaTitleStyle}>{SHELL_COPY.ctaTitle}</p>
      <p mix={ctaBodyStyle}>{SHELL_COPY.ctaBody}</p>
      <a href={routes.login.index.href()} mix={ctaButtonStyle}>
        {SHELL_COPY.ctaButton}
      </a>
    </div>
  )
}

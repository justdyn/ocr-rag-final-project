import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  defaultSidebarOpen,
  SIDEBAR_MOBILE_MAX_PX,
  SIDEBAR_MOBILE_QUERY,
  sidebarOpenAfterAuthChange,
} from './chat-shell-sidebar.ts'

describe('defaultSidebarOpen', () => {
  it('uses the 900px shell breakpoint and stays closed when viewport is unknown (SSR)', () => {
    assert.equal(SIDEBAR_MOBILE_MAX_PX, 900)
    assert.equal(SIDEBAR_MOBILE_QUERY, '(max-width: 900px)')
    assert.equal(defaultSidebarOpen(null), false)
  })

  it('is closed on mobile/narrow and open on desktop', () => {
    assert.equal(defaultSidebarOpen({ matches: true }), false)
    assert.equal(defaultSidebarOpen({ matches: false }), true)
  })
})

describe('sidebarOpenAfterAuthChange', () => {
  it('applies the viewport default only when auth flips from guest to logged-in', () => {
    assert.equal(sidebarOpenAfterAuthChange(false, true, { matches: false }), true)
    assert.equal(sidebarOpenAfterAuthChange(false, true, { matches: true }), false)
    assert.equal(sidebarOpenAfterAuthChange(false, true, null), false)
  })

  it('does not force a new open/closed value on already-auth navigations or logout', () => {
    assert.equal(sidebarOpenAfterAuthChange(true, true, { matches: false }), null)
    assert.equal(sidebarOpenAfterAuthChange(true, false, { matches: false }), null)
    assert.equal(sidebarOpenAfterAuthChange(false, false, { matches: false }), null)
  })
})

/**
 * Collapsed SSR (isOpen=false) must emit the same host tags the desktop client
 * hydrates when it opens the sidebar. Missing tags here become
 * `Hydration mismatch: tag button a` / `tag button div` on first paint.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { router } from '../router.ts'
import { routes } from '../routes.ts'
import { SHELL_COPY } from '../utils/chat-shell-copy.ts'

describe('guest home sidebar SSR chrome', () => {
  it('emits Home <a> + toggle <button> and the guest CTA <div> while collapsed', async () => {
    let response = await router.fetch(new Request('http://localhost' + routes.home.href()))
    assert.equal(response.status, 200)
    let html = await response.text()

    let asideStart = html.indexOf('aria-label="Chat navigation"')
    assert.ok(asideStart >= 0, 'expected chat sidebar aside')
    let asideEnd = html.indexOf('</aside>', asideStart)
    let aside = html.slice(asideStart, asideEnd)

    assert.match(aside, /<a[^>]*aria-label="Home"/)
    assert.match(aside, /<button[^>]*aria-label="Open sidebar"/)
    assert.ok(
      aside.indexOf('aria-label="Home"') < aside.indexOf('aria-label="Open sidebar"'),
      'Home link must precede the toggle so hydration matches [a, button]',
    )
    assert.ok(
      aside.includes(SHELL_COPY.ctaTitle),
      'guest CTA root must stay in collapsed SSR (otherwise open-state <div> hydrates onto a leftover <button>)',
    )
  })
})

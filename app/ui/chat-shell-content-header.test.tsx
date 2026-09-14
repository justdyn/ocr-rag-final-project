/**
 * Library / content-column header must hydrate as a clientEntry so the mobile
 * "Open sidebar" control can dispatch SIDEBAR_OPEN_EVENT (plain SSR on() is dead).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseHTML } from 'linkedom'

// --- DOM shim (must run before any remix/ui import) -------------------------
let dom = parseHTML('<!doctype html><html><body></body></html>')
let globals = globalThis as Record<string, unknown>
for (let key of [
  'document',
  'window',
  'HTMLElement',
  'Element',
  'Node',
  'NodeList',
  'Text',
  'Comment',
  'DocumentFragment',
  'CharacterData',
  'CSSStyleDeclaration',
  'MutationObserver',
  'customElements',
  'getComputedStyle',
  'requestAnimationFrame',
  'cancelAnimationFrame',
]) {
  let value = (dom as unknown as Record<string, unknown>)[key]
  if (value !== undefined) globals[key] = value
}

class FakeCSSStyleSheet {
  cssRules: { cssText: string }[] = []
  insertRule(rule: string, index = 0): number {
    this.cssRules.splice(index, 0, { cssText: rule })
    return index
  }
  deleteRule(index: number): void {
    this.cssRules.splice(index, 1)
  }
}
globals.CSSStyleSheet = FakeCSSStyleSheet
;(dom.document as unknown as { adoptedStyleSheets: unknown[] }).adoptedStyleSheets = []

type LinkedomEventCtor = new (type: string, init?: { bubbles?: boolean }) => Event
let WindowEvent = (dom.window as unknown as Record<string, LinkedomEventCtor>).Event

function click(el: Element): void {
  el.dispatchEvent(new WindowEvent('click', { bubbles: true }))
}

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { ChatShellContentHeader } = await import('./chat-shell-content-header.tsx')
let { SIDEBAR_OPEN_EVENT } = await import('../utils/chat-shell-sidebar.ts')

describe('ChatShellContentHeader — mobile sidebar open', () => {
  it('dispatches SIDEBAR_OPEN_EVENT when Open sidebar is clicked', async () => {
    // linkedom's window cannot accept node's CustomEvent (eventPhase setter).
    // Stub dispatchEvent to observe the event type dispatchSidebarOpen emits.
    let fired = 0
    let prevDispatch = window.dispatchEvent
    window.dispatchEvent = ((event: Event) => {
      if (event.type === SIDEBAR_OPEN_EVENT) fired += 1
      return true
    }) as typeof window.dispatchEvent
    try {
      let view = render(
        <ChatShellContentHeader authenticated knowledgeName="Library" />,
      )
      let button = view.$('button[aria-label="Open sidebar"]')
      assert.ok(button, 'open control rendered')

      await view.act(() => click(button!))
      assert.equal(fired, 1, 'sidebar open event fired once')
    } finally {
      window.dispatchEvent = prevDispatch
    }
  })
})

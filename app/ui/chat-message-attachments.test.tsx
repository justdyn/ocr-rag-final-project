/**
 * Behavioral test for the message-attachment lightbox: a thumb click opens the
 * popover, a dismiss closes it, and a second click reopens it — the open state
 * must reset on the UA `toggle` event, never on a dialog `close` event.
 *
 * Runs on node:test + the @remix-run/ui/test render harness under linkedom —
 * same DOM shim as chat-message-bubble.test.tsx. linkedom has no Popover API,
 * so showPopover/hidePopover are stubbed on HTMLElement.prototype: they flip a
 * data-popover-open marker and dispatch the UA-shaped `toggle` event
 * (newState open/closed), which is the only signal the component may rely on.
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
  // Event/CustomEvent/EventTarget stay as node's globals: the remix runtime
  // dispatches `new Event(...)` on node EventTargets, and linkedom events fail
  // its brand check. linkedom uses its own event classes internally either way.
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

// --- Popover API stub (linkedom has none) ------------------------------------
type LinkedomEventCtor = new (type: string, init?: { bubbles?: boolean }) => Event
let WindowEvent = (dom.window as unknown as Record<string, LinkedomEventCtor>).Event

function toggleEvent(newState: 'open' | 'closed'): Event {
  let event = new WindowEvent('toggle')
  Object.defineProperty(event, 'newState', { value: newState })
  return event
}

let popoverProto = (globals.HTMLElement as unknown as { prototype: Record<string, unknown> })
  .prototype
popoverProto.showPopover = function (this: Element) {
  this.setAttribute('data-popover-open', '')
  this.dispatchEvent(toggleEvent('open'))
}
popoverProto.hidePopover = function (this: Element) {
  this.removeAttribute('data-popover-open')
  this.dispatchEvent(toggleEvent('closed'))
}
if (typeof popoverProto.focus !== 'function') popoverProto.focus = function () {}

function click(el: Element): void {
  el.dispatchEvent(new WindowEvent('click', { bubbles: true }))
}

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { ChatMessageAttachments } = await import('./chat-message-attachments.tsx')
import type { ChatAttachment } from '../utils/chat-types.ts'

let imageAtt: ChatAttachment = {
  file_id: 'file-img',
  filename: 'receipt.png',
  content_type: 'image/png',
  extraction_method: 'ocr:tesseract',
  ocr_confidence: 91.5,
  text_excerpt: null,
}

describe('ChatMessageAttachments — lightbox behavior', () => {
  it('opens on thumb click, closes on dismiss, reopens on a second click', async () => {
    let view = render(<ChatMessageAttachments attachments={[imageAtt]} />)
    let isOpen = () =>
      view.container.querySelector('div[popover="auto"]')?.hasAttribute('data-popover-open') ??
      false
    let backdrop = view.$('div[popover="auto"]')
    assert.ok(backdrop, 'popover host is always mounted')
    assert.equal(isOpen(), false, 'starts closed')

    let thumb = view.$('button[aria-label="Preview receipt.png"]')
    assert.ok(thumb, 'thumb button rendered')

    await view.act(() => click(thumb!))
    assert.equal(isOpen(), true, 'popover opens on thumb click')
    assert.match(
      view.container.querySelector('div[popover="auto"]')?.getAttribute('aria-label') ?? '',
      /receipt\.png/,
    )
    assert.ok(view.$('button[data-preview-close]'), 'panel content rendered inside popover')

    await view.act(() => click(view.$('button[data-preview-close]')!))
    assert.equal(isOpen(), false, 'popover closed after dismiss')
    assert.equal(
      view.container.querySelector('div[popover="auto"]')?.getAttribute('aria-label'),
      'Attachment preview',
      'open state cleared on dismiss',
    )

    await view.act(() => click(thumb!))
    assert.equal(isOpen(), true, 'popover reopens after dismiss')

    view.cleanup()
  })
})

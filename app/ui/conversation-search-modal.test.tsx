/**
 * Conversation search modal component test (node:test + @remix-run/ui/test + linkedom).
 * Verifies: empty query shows all rows, case-insensitive title filter, debounce cancel
 * on close drops stale ticks, dialog chrome, and mobile inset CSS.
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

// prefersReducedMotion guards every animate() call — reduced = instant, node-safe.
;(globals.window as unknown as { matchMedia: () => { matches: boolean } }).matchMedia = () => ({
  matches: true,
})

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

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { ConversationSearchModal } = await import('./conversation-search-modal.tsx')

const CONVERSATIONS = [
  { id: 'c1', title: 'Vendor invoice draft', created_at: 0, updated_at: 0 },
  { id: 'c2', title: 'SPJ accountability letters', created_at: 0, updated_at: 0 },
  { id: 'c3', title: null, created_at: 0, updated_at: 0 },
]

function makeProps(overrides: Partial<{ conversations: typeof CONVERSATIONS }> = {}) {
  return {
    conversations: CONVERSATIONS,
    onClose: () => {},
    ...overrides,
  }
}

function rowTitles(root: Element): string[] {
  return [...root.querySelectorAll('a')].map((a) => (a.textContent ?? '').trim())
}

describe('conversation-search-modal component', () => {
  it('empty query shows all rows including Untitled chat fallback', () => {
    let view = render(<ConversationSearchModal {...makeProps()} />)
    let root = view.$('div')!
    assert.ok(root)

    assert.deepEqual(rowTitles(root), [
      'Vendor invoice draft',
      'SPJ accountability letters',
      'Untitled chat',
    ])
    assert.match(root.textContent ?? '', /Recent chats/)

    view.cleanup()
  })

  it('filters titles case-insensitively after debounce', async () => {
    let view = render(<ConversationSearchModal {...makeProps()} />)
    let root = view.$('div')!
    let input = root.querySelector('#conversation-search') as HTMLInputElement
    assert.ok(input, 'search input present')
    assert.equal(input.getAttribute('placeholder'), 'Search...')

    input.value = 'SPJ'
    input.dispatchEvent(new dom.Event('input', { bubbles: true }))
    // Wait past the 200ms debounce + microtask apply + update tick.
    await new Promise((r) => setTimeout(r, 350))

    let root2 = view.$('div')!
    assert.deepEqual(rowTitles(root2), ['SPJ accountability letters'])

    view.cleanup()
  })

  it('shows empty state when nothing matches', async () => {
    let view = render(<ConversationSearchModal {...makeProps()} />)
    let root = view.$('div')!
    let input = root.querySelector('#conversation-search') as HTMLInputElement
    input.value = 'zzz-no-match'
    input.dispatchEvent(new dom.Event('input', { bubbles: true }))
    await new Promise((r) => setTimeout(r, 350))

    let root2 = view.$('div')!
    assert.deepEqual(rowTitles(root2), [])
    assert.match(root2.textContent ?? '', /No matching chats/)

    view.cleanup()
  })

  it('close cancels the debounce and drops stale search ticks', async () => {
    let view = render(<ConversationSearchModal {...makeProps()} />)
    let root = view.$('div')!
    let input = root.querySelector('#conversation-search') as HTMLInputElement
    input.value = 'spj'
    input.dispatchEvent(new dom.Event('input', { bubbles: true }))
    // Close before the debounce fires — tick must never apply.
    let closeBtn = [...root.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') ?? '').includes('Close search'),
    )
    assert.ok(closeBtn, 'close button present')
    ;(closeBtn as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 350))

    // List must still show the unfiltered rows.
    let root2 = view.$('div')!
    assert.equal(rowTitles(root2).length, 3, 'filter never applied after close')

    view.cleanup()
  })

  it('dialog chrome: role=dialog, aria-modal, search input present with label', () => {
    let view = render(<ConversationSearchModal {...makeProps()} />)
    let root = view.$('div')!

    let dialog = root.getAttribute('role') === 'dialog' ? root : root.querySelector('[role="dialog"]')
    assert.ok(dialog, 'dialog host present')
    assert.equal(dialog!.getAttribute('aria-modal'), 'true')

    let input = root.querySelector('#conversation-search') as HTMLInputElement
    assert.ok(input, 'search input present')
    assert.ok(root.querySelector('label'), 'sr-only search label present')

    view.cleanup()
  })

  it('mobile chrome is inset card not full-bleed (adopted CSS ≤900px)', () => {
    let view = render(<ConversationSearchModal {...makeProps()} />)
    let sheet = (dom.document as unknown as { adoptedStyleSheets: FakeCSSStyleSheet[] })
      .adoptedStyleSheets
    let css = sheet.map((s) => s.cssRules.map((r) => r.cssText).join('\n')).join('\n')
    assert.match(css, /@media\s*\(max-width:\s*900px\)/, 'mobile breakpoint present')
    assert.match(css, /padding:\s*16px/, 'overlay inset padding 16px')
    assert.match(css, /border-radius:\s*24px/, 'desktop card radius 24px')
    assert.match(css, /max-height:\s*min\(85vh,\s*calc\(100%\s*-\s*32px\)\)/, 'card maxHeight inset')
    assert.doesNotMatch(
      css,
      /@media\s*\(max-width:\s*900px\)[^{]*\{[^}]*height:\s*100%/,
      'mobile card must not be height 100%',
    )
    view.cleanup()
  })

  it('search field is seamless (no Settings pill border/fill)', () => {
    let view = render(<ConversationSearchModal {...makeProps()} />)
    let sheet = (dom.document as unknown as { adoptedStyleSheets: FakeCSSStyleSheet[] })
      .adoptedStyleSheets
    let css = sheet.map((s) => s.cssRules.map((r) => r.cssText).join('\n')).join('\n')
    // Seamless field: transparent background + border 0 (not pill 9999px / home-border-strong).
    assert.match(css, /background:\s*transparent/, 'seamless field transparent bg')
    assert.doesNotMatch(
      css,
      /border-radius:\s*9999px/,
      'conversation search must not reuse Settings pill radius',
    )
    view.cleanup()
  })
})

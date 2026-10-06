/**
 * ChatModelSelector — first paint must match SSR (no sync setup loadMore/update).
 * Prefetch runs via handle.queueTask only (MSH-1…MSH-3).
 */
import assert from 'node:assert/strict'
import { after, before, describe, it } from 'node:test'
import { parseHTML } from 'linkedom'

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

let originalFetch = globalThis.fetch
let mockFetch: typeof fetch = async () => {
  // Hang so a sync setup prefetch cannot finish before first-paint asserts.
  await new Promise(() => {})
  return new Response('{}', { status: 200 })
}
before(() => {
  globalThis.fetch = mockFetch
})
after(() => {
  globalThis.fetch = originalFetch
})

let { render } = await import('@remix-run/ui/test')
let { ChatModelSelector } = await import('./model-selector.tsx')
let { SHELL_COPY } = await import('../../utils/chat-shell-copy.ts')

function triggerLabel(root: Element): string {
  let btn = root.querySelector('button[aria-haspopup="listbox"]')
  assert.ok(btn, 'model trigger present')
  let span = btn.querySelector('span')
  return (span?.textContent ?? '').trim()
}

describe('ChatModelSelector hydration-safe first paint', () => {
  it('shows selectedModelLabel on first paint without Loading…', () => {
    let view = render(
      <ChatModelSelector
        selectedModelId="gpt-4o-mini"
        selectedModelLabel="gpt-4o-mini"
        onSelect={() => {}}
      />,
    )
    let root = view.$('div')!
    assert.equal(triggerLabel(root), 'gpt-4o-mini')
    assert.doesNotMatch(triggerLabel(root), /Loading/)
    view.cleanup()
  })

  it('shows Search models placeholder when label empty on first paint', () => {
    let view = render(
      <ChatModelSelector selectedModelId={null} selectedModelLabel="" onSelect={() => {}} />,
    )
    let root = view.$('div')!
    assert.equal(triggerLabel(root), SHELL_COPY.modelSearchPlaceholder)
    assert.doesNotMatch(triggerLabel(root), /Loading/)
    view.cleanup()
  })
})

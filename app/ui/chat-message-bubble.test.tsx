/**
 * Component tests for chat thread turn markup (ChatGPT-style layout, §3.5 skin).
 *
 * Runs on node:test + the @remix-run/ui/test render harness under linkedom.
 * linkedom has no CSSOM, so a minimal CSSStyleSheet facade is installed and
 * `css()` mixin rules are asserted from `document.adoptedStyleSheets` — the
 * layout contract (right-aligned pill, flush prose) is checked against the
 * actual emitted rules, not class names.
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

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { ChatMessageBubble } = await import('./chat-message-bubble.tsx')
import type { ChatMessage } from '../utils/chat-types.ts'

function cssRuleText(): string[] {
  let sheets = (dom.document as unknown as { adoptedStyleSheets: { cssRules: { cssText: string }[] }[] })
    .adoptedStyleSheets
  return sheets.flatMap((sheet) => sheet.cssRules.map((rule) => rule.cssText))
}

/** The css() rule emitted for an element (elements here carry only css() classes). */
function ruleFor(el: Element | null): string {
  assert.ok(el, 'element exists')
  let rule = cssRuleText().find((text) => text.includes(el.className))
  assert.ok(rule !== undefined, `css() rule found for .${el.className}`)
  return rule
}

function renderMessage(message: ChatMessage) {
  return render(<ChatMessageBubble message={message} />)
}

let baseSource = {
  id: 1,
  chunk_id: 'c1',
  file_id: 'f1',
  text: 'chunk text',
  rrf_score: null,
  rerank_score: null,
  extraction_method: null,
  rank: null,
} as const

describe('ChatMessageBubble — user turn', () => {
  it('renders a right-aligned pill with no role label', () => {
    let view = renderMessage({
      localId: 'u1',
      role: 'user',
      content: 'Hello thread',
      sources: [],
    })
    let text = view.container.textContent ?? ''
    assert.ok(!text.includes('You'), `no "You" role chip, got: ${text}`)

    let li = view.$('li')
    assert.ok(li, 'turn is a list item')
    let paragraph = li!.querySelector('p')
    assert.ok(paragraph, 'user text renders as a <p> inside the pill')
    assert.equal(paragraph!.textContent, 'Hello thread')

    let rowRule = ruleFor(li)
    assert.ok(rowRule.includes('flex-end'), `user row right-aligns the pill, got: ${rowRule}`)
    view.cleanup()
  })

  it('styles the pill as a large-radius surface, not a bordered card', () => {
    let view = renderMessage({
      localId: 'u1',
      role: 'user',
      content: 'Hello thread',
      sources: [],
    })
    let pill = view.$('li')!.firstElementChild
    let pillRule = ruleFor(pill)
    assert.ok(pillRule.includes('24px'), `pill uses a large radius, got: ${pillRule}`)
    assert.ok(pillRule.includes('--home-surface'), `pill uses the shell surface token, got: ${pillRule}`)
    view.cleanup()
  })
})

describe('ChatMessageBubble — assistant turn', () => {
  it('renders flush prose with no role label and no card', () => {
    let view = renderMessage({
      localId: 'a1',
      role: 'assistant',
      content: 'Answer text',
      sources: [],
    })
    let text = view.container.textContent ?? ''
    assert.ok(!text.includes('Assistant'), `no "Assistant" role chip, got: ${text}`)

    let li = view.$('li')
    assert.ok(li, 'turn is a list item')
    let proseRule = ruleFor(li!.firstElementChild)
    assert.ok(proseRule.length > 0, 'assistant prose carries a css() mixin')
    assert.ok(!proseRule.includes('border'), `no card border, got: ${proseRule}`)
    assert.ok(!proseRule.includes('background'), `no card fill, got: ${proseRule}`)
    view.cleanup()
  })

  it('keeps inline citation chips', () => {
    let view = renderMessage({
      localId: 'a1',
      role: 'assistant',
      content: 'Alpha [1] beta',
      sources: [baseSource as unknown as ChatMessage['sources'][number]],
    })
    let chip = Array.from(view.$$('button')).find((b) => b.textContent === '[1]')
    assert.ok(chip, 'citation chip rendered inline')
    view.cleanup()
  })

  it('shows a quiet Thinking… placeholder while streaming', () => {
    let view = renderMessage({
      localId: 'a1',
      role: 'assistant',
      content: '',
      sources: [],
    })
    assert.match(view.container.textContent ?? '', /Thinking…/)
    view.cleanup()
  })

  it('marks incomplete turns accessibly (sr-only, not a loud suffix)', () => {
    let view = renderMessage({
      localId: 'a1',
      role: 'assistant',
      content: 'Partial answer',
      sources: [],
      incomplete: true,
    })
    let text = view.container.textContent ?? ''
    assert.ok(!text.includes('· incomplete'), `old visible suffix removed, got: ${text}`)
    let sr = view.container.querySelector('.sr-only')
    assert.ok(sr, 'sr-only incomplete note present')
    assert.match(sr!.textContent ?? '', /incomplete/i)
    view.cleanup()
  })
})

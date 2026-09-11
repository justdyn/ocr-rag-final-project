/**
 * CSS-contract tests for the viewport-bound chat shell (scroll-ownership fix).
 *
 * Runs on node:test + the @remix-run/ui/test render harness under linkedom.
 * linkedom has no CSSOM, so a minimal CSSStyleSheet facade is installed and
 * `css()` mixin rules are asserted from `document.adoptedStyleSheets` — the
 * layout contract (100dvh shell, document never scrolls, inner scrollers own
 * overflow) is checked against the actual emitted rules, not class names.
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
let { shellStyle } = await import('./styles/chat-shell/shell-styles.ts')
let { chatScrollRegionStyle, chatThreadStyle, mainContentWideStyle, mainStyle } =
  await import('./styles/chat-shell/main-styles.ts')
let { sidebarConversationsStyle, sidebarStyle } = await import(
  './styles/chat-shell/sidebar-styles.ts'
)

function ruleFor(el: Element | null): string {
  assert.ok(el, 'element exists')
  let sheets = (dom.document as unknown as {
    adoptedStyleSheets: { cssRules: { cssText: string }[] }[]
  }).adoptedStyleSheets
  let rule = sheets
    .flatMap((sheet) => sheet.cssRules.map((r) => r.cssText))
    .find((text) => text.includes(el.className))
  assert.ok(rule !== undefined, `css() rule found for .${el.className}`)
  return rule
}

describe('chat shell — viewport-bound layout contract', () => {
  it('shell pins to the dynamic viewport and clips overflow', () => {
    let view = render(<div mix={shellStyle} />)
    let rule = ruleFor(view.$('div'))
    assert.match(rule, /height:\s*100dvh/, `shell has a definite viewport height, got: ${rule}`)
    assert.match(rule, /overflow:\s*hidden/, `shell clips overflow, got: ${rule}`)
    assert.doesNotMatch(rule, /min-height:\s*100vh/, 'shell must not grow past the viewport')
    assert.doesNotMatch(rule, /--home-sidebar/, `dead --home-sidebar var removed, got: ${rule}`)
    view.cleanup()
  })

  it('main column no longer forces document growth', () => {
    let view = render(<div mix={mainStyle} />)
    let rule = ruleFor(view.$('div'))
    assert.doesNotMatch(rule, /min-height:\s*100vh/, `main stretches to the shell, got: ${rule}`)
    assert.match(rule, /overflow:\s*hidden/, `main keeps its clip, got: ${rule}`)
    view.cleanup()
  })

  it('full-bleed chat region is the inner scroller (scrollbar at panel edge)', () => {
    let view = render(<div mix={chatScrollRegionStyle} />)
    let rule = ruleFor(view.$('div'))
    assert.match(rule, /overflow-y:\s*auto/, `region owns vertical scroll, got: ${rule}`)
    assert.match(rule, /min-height:\s*0/, `region may shrink below content, got: ${rule}`)
    assert.match(rule, /width:\s*100%/, `region spans the main panel, got: ${rule}`)
    view.cleanup()
  })

  it('empty-stage and thread hide styles only toggle display (always mounted)', async () => {
    let { emptyStageHiddenStyle, chatThreadHiddenStyle } = await import(
      './styles/chat-shell/main-styles.ts'
    )
    let hiddenStage = render(<div mix={emptyStageHiddenStyle} />)
    let stageRule = ruleFor(hiddenStage.$('div'))
    assert.match(stageRule, /display:\s*none/, `empty stage hide is display:none, got: ${stageRule}`)
    hiddenStage.cleanup()

    let hiddenThread = render(<ul mix={chatThreadHiddenStyle} />)
    let threadRule = ruleFor(hiddenThread.$('ul'))
    assert.match(threadRule, /display:\s*none/, `thread hide is display:none, got: ${threadRule}`)
    hiddenThread.cleanup()
  })

  it('thread list grows with content and does not own overflow', () => {
    let view = render(<ul mix={chatThreadStyle} />)
    let rule = ruleFor(view.$('ul'))
    assert.doesNotMatch(rule, /overflow-y:\s*auto/, `thread must not own scroll, got: ${rule}`)
    view.cleanup()
  })

  it('DocIntel wide content column is its own full-bleed scroller', () => {
    let view = render(<main mix={mainContentWideStyle} />)
    let rule = ruleFor(view.$('main'))
    assert.match(rule, /overflow-y:\s*auto/, `wide content owns vertical scroll, got: ${rule}`)
    assert.match(rule, /min-height:\s*0/, `wide content may shrink below content, got: ${rule}`)
    assert.doesNotMatch(
      rule,
      /max-width:\s*960px/,
      `max-width lives on the inner panel so the scrollbar stays edge-aligned, got: ${rule}`,
    )
    view.cleanup()
  })

  it('sidebar aside is viewport-tall, not document-tall', () => {
    let view = render(<aside mix={sidebarStyle} />)
    let rule = ruleFor(view.$('aside'))
    assert.match(rule, /height:\s*100%/, `aside fills its track, got: ${rule}`)
    assert.doesNotMatch(rule, /min-height:\s*100vh/, 'aside must not force document growth')
    view.cleanup()
  })

  it('sidebar conversations nav scrolls internally', () => {
    let view = render(<nav mix={sidebarConversationsStyle} />)
    let rule = ruleFor(view.$('nav'))
    assert.match(rule, /overflow-y:\s*auto/, `conversation list owns vertical scroll, got: ${rule}`)
    assert.match(rule, /min-height:\s*0/, `conversation list may shrink below content, got: ${rule}`)
    view.cleanup()
  })
})

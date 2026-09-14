/**
 * CSS-contract test: Library table footer pagination never wraps its labels.
 * Desktop keeps the shadcn-style footer (meta + rows-per-page + page buttons);
 * at ≤ SIDEBAR_MOBILE_MAX_PX the Prev/Next words hide (aria-labels carry the
 * name) and the buttons go icon-only.
 *
 * Runs on node:test + the @remix-run/ui/test render harness under linkedom,
 * mirroring chat-shell-layout-styles.test.tsx (no CSSOM → FakeCSSStyleSheet;
 * css() rules asserted from document.adoptedStyleSheets).
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
let { SHELL_COPY } = await import('../utils/chat-shell-copy.ts')
let { SIDEBAR_MOBILE_MAX_PX } = await import('../utils/chat-shell-sidebar.ts')
let { libraryPageButtonStyle, libraryPaginationStyle } = await import(
  './styles/library/library-styles.ts'
)
let { renderLibraryTableFooter } = await import('./library/library-table-footer.tsx')

function joinedRuleText(el: Element): string {
  let sheets = (dom.document as unknown as {
    adoptedStyleSheets: { cssRules: { cssText: string }[] }[]
  }).adoptedStyleSheets
  return sheets
    .flatMap((sheet) => sheet.cssRules.map((r) => r.cssText))
    .filter((t) => t.includes(el.className))
    .join('\n')
}

describe('library table footer — pagination never wraps its labels', () => {
  it('page buttons are nowrap + flex-shrink:0 so chevron and word never stack', () => {
    let view = render(<button mix={libraryPageButtonStyle} />)
    let button = view.$('button')
    assert.ok(button, 'page button exists')
    let rule = joinedRuleText(button)
    assert.match(rule, /white-space:\s*nowrap/, `labels stay inline, got: ${rule}`)
    assert.match(
      rule,
      /flex-shrink:\s*0/,
      `buttons never get squeezed into internal wrapping, got: ${rule}`,
    )
    view.cleanup()
  })

  it(`mobile (≤${SIDEBAR_MOBILE_MAX_PX}px): label spans hide, chevrons + aria-labels stay`, () => {
    let styleView = render(<div mix={libraryPaginationStyle} />)
    let styleEl = styleView.$('div')
    assert.ok(styleEl, 'pagination element exists')
    let styleRule = joinedRuleText(styleEl)
    assert.match(
      styleRule,
      new RegExp(
        `@media[^{]*max-width:\\s*${SIDEBAR_MOBILE_MAX_PX}px[\\s\\S]*?data-library-page-label[\\s\\S]*?display:\\s*none`,
      ),
      `icon-only media gate exists, got: ${styleRule}`,
    )
    styleView.cleanup()

    let view = render(
      renderLibraryTableFooter({
        page: 3,
        limit: 10,
        total: 30,
        onLimitChange: () => {},
        onPageChange: () => {},
      }),
    )
    let prev = view.$(`button[aria-label="${SHELL_COPY.libraryPrev}"]`)
    assert.ok(prev, 'prev button keeps its aria-label for icon-only mode')
    let label = view.$('span[data-library-page-label]')
    assert.ok(label, 'prev word is wrapped in a hideable span')
    assert.equal(label.textContent, SHELL_COPY.libraryPrev)
    view.cleanup()
  })
})

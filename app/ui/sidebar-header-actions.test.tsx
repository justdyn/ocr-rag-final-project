/**
 * Sidebar header actions — stable Toggle-then-Search DOM; CSS owns visual order.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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

let { render } = await import('@remix-run/ui/test')
let {
  sidebarHeaderActionsStyle,
  sidebarHomeLinkStyle,
  sidebarStyle,
  iconButtonStyle,
} = await import('./styles/chat-shell/sidebar-styles.ts')

function ruleFor(el: Element | null): string {
  assert.ok(el, 'element exists')
  let sheets = (dom.document as unknown as {
    adoptedStyleSheets: { cssRules: { cssText: string }[] }[]
  }).adoptedStyleSheets
  let rule = sheets
    .flatMap((sheet) => sheet.cssRules.map((r) => r.cssText))
    .find((text) => text.includes(el.className))
  assert.ok(rule !== undefined, `css() rule found for .${el.className}`)
  return rule!
}

/** Mirror chat-sidebar: always Toggle then Search (CSS row-reverse / column for visual). */
function headerActionOrder(isOpen: boolean) {
  let search = <button key="search" type="button" aria-label="Search conversations" />
  let toggle = (
    <button key="toggle" type="button" aria-label={isOpen ? 'Close sidebar' : 'Open sidebar'} />
  )
  return [toggle, search]
}

describe('sidebar header actions collapsed Search', () => {
  it('actions cluster stacks column when collapsed; Home alone is display none', () => {
    function Probe(_handle: { props: Record<string, never> }) {
      return () => (
        <div>
          <div data-actions="" data-collapsed="true" mix={sidebarHeaderActionsStyle} />
          <a data-home="" data-collapsed="true" mix={sidebarHomeLinkStyle} href="/" />
        </div>
      )
    }
    let view = render(<Probe />)
    let root = view.$('div')!
    let actions = root.querySelector('[data-actions]')
    let home = root.querySelector('[data-home]')
    let actionsRule = ruleFor(actions)
    let homeRule = ruleFor(home)

    assert.match(
      actionsRule,
      /\[data-collapsed=["']true["']\][^}]*flex-direction:\s*column/,
      'collapsed actions use flex-direction column',
    )
    assert.match(
      homeRule,
      /\[data-collapsed=["']true["']\][^}]*display:\s*none/,
      'collapsed Home is display none',
    )
    assert.doesNotMatch(
      actionsRule,
      /\[data-collapsed=["']true["']\][^}]*display:\s*none/,
      'actions cluster must not hide on collapse',
    )

    view.cleanup()
  })

  it('open actions use row-reverse; DOM order stays Toggle then Search', () => {
    function StyleProbe(_handle: { props: Record<string, never> }) {
      return () => <div data-actions="" data-collapsed="false" mix={sidebarHeaderActionsStyle} />
    }
    let styleView = render(<StyleProbe />)
    let actionsRule = ruleFor(styleView.$('[data-actions]'))
    assert.match(actionsRule, /flex-direction:\s*row-reverse/, 'open uses row-reverse for Search|Toggle visual')
    styleView.cleanup()

    function DomProbe(_handle: { props: Record<string, never> }) {
      return () => <div data-actions="">{headerActionOrder(true)}</div>
    }
    let open = render(<DomProbe />)
    let openBtns = open.$('[data-actions]')!.querySelectorAll('button')
    assert.equal(openBtns.length, 2)
    assert.equal(openBtns[0]!.getAttribute('aria-label'), 'Close sidebar')
    assert.equal(openBtns[1]!.getAttribute('aria-label'), 'Search conversations')
    open.cleanup()

    function CollapsedProbe(_handle: { props: Record<string, never> }) {
      return () => <div data-actions="">{headerActionOrder(false)}</div>
    }
    let collapsed = render(<CollapsedProbe />)
    let collapsedBtns = collapsed.$('[data-actions]')!.querySelectorAll('button')
    assert.equal(collapsedBtns[0]!.getAttribute('aria-label'), 'Open sidebar')
    assert.equal(collapsedBtns[1]!.getAttribute('aria-label'), 'Search conversations')
    collapsed.cleanup()
  })

  it('iconButtonStyle locks 36px hit box against flex-shrink', () => {
    function Probe(_handle: { props: Record<string, never> }) {
      return () => <button type="button" data-icon-btn="" mix={iconButtonStyle} />
    }
    let view = render(<Probe />)
    let rule = ruleFor(view.$('[data-icon-btn]'))
    assert.match(rule, /flex-shrink:\s*0/, 'icon buttons must not flex-shrink')
    assert.match(rule, /min-width:\s*36px/, 'icon buttons lock min-width 36px')
    assert.match(rule, /min-height:\s*36px/, 'icon buttons lock min-height 36px')
    view.cleanup()
  })

  it('sidebarStyle transition snaps width (no width tween on aside)', () => {
    function Probe(_handle: { props: Record<string, never> }) {
      return () => <aside data-aside="" mix={sidebarStyle} />
    }
    let view = render(<Probe />)
    let rule = ruleFor(view.$('[data-aside]'))
    assert.doesNotMatch(
      rule,
      /transition:[^;]*\bwidth\b/,
      'aside must not transition width (track owns rail width anim)',
    )
    assert.match(rule, /transition:/, 'aside still transitions transform/opacity')
    view.cleanup()
  })
})

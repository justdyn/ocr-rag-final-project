/**
 * LucideIcon — SVG child count must match icon nodes (no leftover merge).
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { parseHTML } from 'linkedom'
import { PanelLeftClose, Search } from 'lucide'

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
let { LucideIcon, lucideIconSignature } = await import('./lucide-icon.tsx')

describe('LucideIcon glyph integrity', () => {
  it('lucideIconSignature differs for Search vs PanelLeftClose', () => {
    assert.notEqual(lucideIconSignature(Search), lucideIconSignature(PanelLeftClose))
    assert.match(lucideIconSignature(Search), /circle:/)
    assert.match(lucideIconSignature(PanelLeftClose), /rect:/)
  })

  it('renders exactly icon.length SVG children for Search and PanelLeftClose', () => {
    function SearchProbe(_handle: { props: Record<string, never> }) {
      return () => (
        <div data-wrap="">
          <LucideIcon icon={Search} size={20} strokeWidth={1.75} />
        </div>
      )
    }
    let searchView = render(<SearchProbe />)
    let searchSvg = searchView.$('[data-wrap]')!.querySelector('svg')
    assert.ok(searchSvg)
    assert.equal(searchSvg.childElementCount, Search.length, 'Search SVG kids = icon nodes')
    searchView.cleanup()

    function CloseProbe(_handle: { props: Record<string, never> }) {
      return () => (
        <div data-wrap="">
          <LucideIcon icon={PanelLeftClose} size={20} strokeWidth={1.75} />
        </div>
      )
    }
    let closeView = render(<CloseProbe />)
    let closeSvg = closeView.$('[data-wrap]')!.querySelector('svg')
    assert.ok(closeSvg)
    assert.equal(closeSvg.childElementCount, PanelLeftClose.length, 'PanelLeftClose SVG kids = icon nodes')
    closeView.cleanup()
  })
})

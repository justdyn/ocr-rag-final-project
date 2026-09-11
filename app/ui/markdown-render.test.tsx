/**
 * Component tests for MarkdownRender (mdast → Remix renderer).
 *
 * Runs on node:test + the @remix-run/ui/test render harness under linkedom,
 * with the same DOM shim as chat-message-bubble.test.tsx.
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

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { MarkdownRender } = await import('./markdown-render.tsx')
import type { RemixNode } from 'remix/ui'

function renderMarkdown(
  content: string,
  renderCitation?: (id: number, key: string) => RemixNode,
) {
  return render(
    <MarkdownRender content={content} keyPrefix="k" renderCitation={renderCitation} />,
  )
}

describe('MarkdownRender — blocks', () => {
  it('renders heading and paragraph text', () => {
    let view = renderMarkdown('# Title\n\nBody **bold** text.')
    assert.equal(view.$('h1')?.textContent, 'Title')
    let p = view.$('p')
    assert.ok(p, 'paragraph rendered')
    assert.ok(p!.querySelector('strong'), 'strong emphasis rendered inline')
    view.cleanup()
  })

  it('renders ordered and unordered lists with flattened items', () => {
    let view = renderMarkdown('- a\n- b\n\n1. one\n2. two\n')
    let ul = view.$('ul')
    let ol = view.$('ol')
    assert.ok(ul && ol, 'both list kinds rendered')
    assert.equal(ul!.querySelectorAll('li').length, 2)
    assert.equal(ol!.querySelectorAll('li').length, 2)
    view.cleanup()
  })

  it('renders a fenced code block with its value', () => {
    let view = renderMarkdown('```js\nlet x = 1\n```\n')
    let code = view.$('pre code')
    assert.ok(code, 'code block rendered as pre>code')
    assert.match(code!.textContent ?? '', /let x = 1/)
    view.cleanup()
  })

  it('auto-closes a dangling fence mid-stream (no swallowed tail)', () => {
    let view = renderMarkdown('```js\nlet x = 1')
    let code = view.$('pre code')
    assert.ok(code, 'dangling fence still renders a code block')
    assert.equal(view.$$('pre').length, 1)
    view.cleanup()
  })

  it('renders a GFM table with header and body cells', () => {
    let view = renderMarkdown('| a | b |\n| - | - |\n| 1 | 2 |\n')
    assert.ok(view.$('table'), 'table rendered')
    assert.equal(view.$$('th').length, 2)
    assert.equal(view.$$('td').length, 2)
    view.cleanup()
  })

  it('renders blockquotes and thematic breaks', () => {
    let view = renderMarkdown('> quoted\n\n---\n')
    assert.ok(view.$('blockquote'), 'blockquote rendered')
    assert.ok(view.$('hr'), 'hr rendered')
    view.cleanup()
  })
})

describe('MarkdownRender — links and security', () => {
  it('renders safe links as anchors', () => {
    let view = renderMarkdown('[docs](https://example.com/a)')
    let a = view.$('a')
    assert.ok(a, 'anchor rendered')
    assert.equal(a!.getAttribute('href'), 'https://example.com/a')
    view.cleanup()
  })

  it('degrades dangerous-scheme links to plain text', () => {
    let view = renderMarkdown('[click](javascript:alert(1))')
    assert.equal(view.$('a'), null)
    assert.match(view.container.textContent ?? '', /click/)
    view.cleanup()
  })

  it('drops raw HTML instead of injecting it', () => {
    let view = renderMarkdown('before <script>alert(1)</script> after')
    let html = view.container.innerHTML ?? ''
    assert.ok(!html.includes('<script'), `no raw script injected, got: ${html}`)
    view.cleanup()
  })

  it('keeps [N] literal inside inline code (no chip)', () => {
    let view = renderMarkdown('use `[1]` verbatim', () => {
      throw new Error('inlineCode must not reach the citation sink')
    })
    assert.equal(view.$('code')?.textContent, '[1]')
    view.cleanup()
  })
})

describe('MarkdownRender — citations', () => {
  it('routes [N] text markers to renderCitation with stable keys', () => {
    let seen: { id: number; key: string }[] = []
    let view = renderMarkdown('Alpha [2] beta', (id, key) => {
      seen.push({ id, key })
      return <button type="button">{`[${id}]`}</button>
    })
    let chip = Array.from(view.$$('button')).find((b) => b.textContent === '[2]')
    assert.ok(chip, 'citation chip rendered')
    assert.deepEqual(seen, [{ id: 2, key: 'k-b0-0-c0-2' }])
    assert.match(view.container.textContent ?? '', /Alpha/)
    view.cleanup()
  })

  it('renders [N] as literal text when no citation sink is given', () => {
    let view = renderMarkdown('Alpha [3] beta')
    assert.equal(view.$('button'), null)
    assert.match(view.container.textContent ?? '', /\[3\]/)
    view.cleanup()
  })
})

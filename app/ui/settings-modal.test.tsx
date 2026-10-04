/**
 * Settings modal component test (node:test + @remix-run/ui/test + linkedom).
 * Verifies Account/Password panes replaced General stubs: default pane,
 * pane toggle, form fields, and admin-only LLM nav.
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
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

let originalFetch = globalThis.fetch
let mockFetch: typeof fetch = async () => new Response('', { status: 200 })
before(() => {
  globalThis.fetch = mockFetch
})
after(() => {
  globalThis.fetch = originalFetch
})

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { SettingsModal } = await import('./settings-modal.tsx')

function makeProps(overrides: Partial<{ userRole: 'admin' | 'user' }> = {}) {
  return {
    userRole: 'user' as const,
    userName: 'Test User',
    userEmail: 'test@example.com',
    onClose: () => {},
    ...overrides,
  }
}

describe('settings-modal component', () => {
  it('defaults to Account pane with read-only email and name input', () => {
    let view = render(<SettingsModal {...makeProps()} />)
    let root = view.$('div')!
    assert.ok(root)

    assert.match(root.textContent ?? '', /Account/)
    assert.match(root.textContent ?? '', /Email cannot be changed/)
    assert.match(root.textContent ?? '', /Display name/)
    assert.doesNotMatch(root.textContent ?? '', /Coming soon/)

    let emailInput = root.querySelector('input[type="email"]') as HTMLInputElement
    assert.ok(emailInput)
    assert.equal(emailInput.getAttribute('value'), 'test@example.com')
    assert.ok(emailInput.hasAttribute('disabled'), 'email must be read-only')

    let nameInput = root.querySelector('#settings-name') as HTMLInputElement
    assert.ok(nameInput)
    assert.equal(nameInput.getAttribute('value'), 'Test User')

    let saveBtn = [...root.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Save'),
    )
    assert.ok(saveBtn, 'Save button present')

    view.cleanup()
  })

  it('Password pane has current + new password inputs with min length', async () => {
    let view = render(<SettingsModal {...makeProps()} />)
    let root = view.$('div')!

    let pwdTab = [...root.querySelectorAll('button[role="tab"]')].find((b) =>
      (b.textContent ?? '').includes('Password'),
    )
    assert.ok(pwdTab, 'Password nav item present')
    ;(pwdTab as HTMLElement).click()
    // Wait for async update tick (pane swap re-renders on queued update)
    await new Promise((r) => setTimeout(r, 50))

    let root2 = view.$('div')!
    let pwdInputs = [...root2.querySelectorAll('input[type="password"]')]
    assert.equal(pwdInputs.length, 2)
    assert.equal(pwdInputs[1].getAttribute('minlength'), '8')
    assert.match(root2.textContent ?? '', /Minimum 8 characters/)

    let updateBtn = [...root2.querySelectorAll('button')].find((b) =>
      (b.textContent ?? '').includes('Update'),
    )
    assert.ok(updateBtn, 'Update button present')

    view.cleanup()
  })

  it('non-admin has no LLM / API tab', () => {
    let view = render(<SettingsModal {...makeProps({ userRole: 'user' })} />)
    let root = view.$('div')!
    let tabs = [...root.querySelectorAll('button[role="tab"]')].map((b) => b.textContent ?? '')
    assert.ok(tabs.some((t) => t.includes('Account')))
    assert.ok(tabs.some((t) => t.includes('Password')))
    assert.ok(!tabs.some((t) => t.includes('LLM / API')))
    view.cleanup()
  })

  it('admin has LLM / API tab', () => {
    let view = render(<SettingsModal {...makeProps({ userRole: 'admin' })} />)
    let root = view.$('div')!
    let tabs = [...root.querySelectorAll('button[role="tab"]')].map((b) => b.textContent ?? '')
    assert.ok(tabs.some((t) => t.includes('LLM / API')))
    view.cleanup()
  })

  it('modal shell and body carry min-height flex rules (adopted CSS)', () => {
    let view = render(<SettingsModal {...makeProps()} />)
    let sheet = (dom.document as unknown as { adoptedStyleSheets: FakeCSSStyleSheet[] })
      .adoptedStyleSheets
    let css = sheet.map((s) => s.cssRules.map((r) => r.cssText).join('\n')).join('\n')
    assert.match(css, /min-height:\s*420px/, 'modal shell minHeight present')
    assert.match(css, /min-height:\s*360px/, 'modal body minHeight present')
    assert.match(css, /flex:\s*1 1 auto/, 'modal body flex fill present')
    view.cleanup()
  })

  it('mobile chrome is inset card not full-bleed (adopted CSS ≤900px)', () => {
    let view = render(<SettingsModal {...makeProps()} />)
    let sheet = (dom.document as unknown as { adoptedStyleSheets: FakeCSSStyleSheet[] })
      .adoptedStyleSheets
    let css = sheet.map((s) => s.cssRules.map((r) => r.cssText).join('\n')).join('\n')
    assert.match(css, /@media\s*\(max-width:\s*900px\)/, 'mobile breakpoint present')
    assert.match(css, /padding:\s*16px/, 'overlay inset padding 16px')
    assert.match(css, /border-radius:\s*20px/, 'shell radius 20px')
    assert.match(css, /max-height:\s*min\(85vh,\s*calc\(100%\s*-\s*32px\)\)/, 'shell maxHeight inset')
    // Full-bleed shell used height:100% + radius 0 — must not remain as the mobile card rule.
    assert.doesNotMatch(
      css,
      /@media\s*\(max-width:\s*900px\)[^{]*\{[^}]*height:\s*100%/,
      'mobile shell must not be height 100%',
    )
    view.cleanup()
  })

  it('renders FormField shell variant fields (data-form-field)', () => {
    let view = render(<SettingsModal {...makeProps()} />)
    let root = view.$('div')!
    let fields = root.querySelectorAll('[data-form-field="shell"]')
    assert.ok(fields.length >= 2, 'email + name use FormField shell variant')
    view.cleanup()
  })

  it('chrome matches Figma 5:1247: no header bar, close in rail, pill search', () => {
    let view = render(<SettingsModal {...makeProps()} />)
    let root = view.$('div')!

    // No top header bar; title is sr-only labelling only
    assert.equal(root.querySelector('header'), null, 'no header element')
    let title = root.querySelector('#settings-modal-title')
    assert.ok(title, 'sr-only Settings heading present for aria-labelledby')

    // Close button lives inside the left rail <nav>
    let closeBtn = [...root.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') ?? '').includes('Close settings'),
    )
    assert.ok(closeBtn, 'close button present')
    assert.ok(closeBtn!.closest('nav'), 'close button inside nav rail')

    // Pill search: leading magnifier svg + sr-only label + placeholder
    let search = root.querySelector('#settings-search') as HTMLInputElement
    assert.ok(search, 'search input present')
    assert.equal(search.getAttribute('placeholder'), 'Search settings')
    let searchHost = search.closest('div')!
    assert.ok(searchHost.querySelector('svg'), 'leading magnifier icon present')
    let searchLabel = searchHost.querySelector('label')
    assert.ok(searchLabel, 'search label present')

    view.cleanup()
  })

  it('has no ChatGPT stub categories', () => {
    let view = render(<SettingsModal {...makeProps({ userRole: 'admin' })} />)
    let root = view.$('div')!
    let text = root.textContent ?? ''
    assert.doesNotMatch(text, /Billing/)
    assert.doesNotMatch(text, /\bGeneral\b/)
    assert.doesNotMatch(text, /Data controls/)
    view.cleanup()
  })

  async function typeSearch(view: ReturnType<typeof render>, query: string) {
    let root = view.$('div')!
    let input = root.querySelector('#settings-search') as HTMLInputElement
    assert.ok(input, 'search input present')
    input.value = query
    input.dispatchEvent(new dom.Event('input', { bubbles: true }))
    // Wait past the 200ms debounce + microtask apply + update tick.
    await new Promise((r) => setTimeout(r, 350))
  }

  it('search filters nav to matching items (synonym "api" → LLM) and auto-selects pane', async () => {
    let view = render(<SettingsModal {...makeProps({ userRole: 'admin' })} />)
    await typeSearch(view, 'api')

    let root = view.$('div')!
    let tabs = [...root.querySelectorAll('button[role="tab"]')].map((b) => b.textContent ?? '')
    assert.deepEqual(
      tabs.filter((t) => t.trim() !== ''),
      ['LLM / API'],
      'only LLM / API tab remains for "api"',
    )
    // Active pane filtered out → auto-selected first remaining visible item
    assert.match(root.textContent ?? '', /API Key/)

    view.cleanup()
  })

  it('search with no visible matches shows empty state (non-admin "api")', async () => {
    let view = render(<SettingsModal {...makeProps({ userRole: 'user' })} />)
    await typeSearch(view, 'api')

    let root = view.$('div')!
    let tabs = [...root.querySelectorAll('button[role="tab"]')]
    assert.equal(tabs.length, 0, 'no tabs remain')
    assert.match(root.textContent ?? '', /No matching settings/)

    view.cleanup()
  })

  it('close cancels the debounce and drops stale search ticks', async () => {
    let view = render(<SettingsModal {...makeProps({ userRole: 'admin' })} />)
    let root = view.$('div')!
    let input = root.querySelector('#settings-search') as HTMLInputElement
    input.value = 'api'
    input.dispatchEvent(new dom.Event('input', { bubbles: true }))
    // Close before the debounce fires — tick must never apply.
    let closeBtn = [...root.querySelectorAll('button')].find((b) =>
      (b.getAttribute('aria-label') ?? '').includes('Close settings'),
    )
    assert.ok(closeBtn, 'close button present')
    ;(closeBtn as HTMLElement).click()
    await new Promise((r) => setTimeout(r, 350))

    let root2 = view.$('div')!
    let tabs = [...root2.querySelectorAll('button[role="tab"]')].map((b) => b.textContent ?? '')
    assert.ok(tabs.some((t) => t.includes('Account')), 'filter never applied after close')
    assert.ok(tabs.some((t) => t.includes('Password')), 'filter never applied after close')

    view.cleanup()
  })
})
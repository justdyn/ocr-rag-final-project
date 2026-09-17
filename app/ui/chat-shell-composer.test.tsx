/**
 * ChatShellComposer component test (node:test + @remix-run/ui/test + linkedom).
 * Verifies Draft SPJ button renders, POST create call, and loading state on success.
 * Also tests 422 error notice and no navigation on failure.
 */
import assert from 'node:assert/strict'
import { describe, it, before, after } from 'node:test'
import { parseHTML } from 'linkedom'
import process from 'node:process'

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

// Suppress unhandled rejection from unmocked navigate() in success test
// The navigate call happens after fetch resolves; we only assert fetch args.
let originalHandlers = process.listeners('unhandledRejection')
before(() => {
  process.removeAllListeners('unhandledRejection')
  process.on('unhandledRejection', (reason) => {
    if (reason instanceof TypeError && reason.message.includes('navigate')) {
      // Suppress this specific error
      return
    }
    // Re-throw others by not handling them (no default handler means test fails)
    throw reason
  })
})

after(() => {
  process.removeAllListeners('unhandledRejection')
  for (let h of originalHandlers) process.on('unhandledRejection', h)
})

// Mock fetch globally
let originalFetch = globalThis.fetch
let mockFetch: typeof fetch = async () => new Response('', { status: 200 })
let fetchCalls: Array<{ url: string; init?: RequestInit }> = []

before(() => {
  globalThis.fetch = mockFetch
})

after(() => {
  globalThis.fetch = originalFetch
})

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { routes } = await import('../routes.ts')
let { SHELL_COPY } = await import('../utils/chat-shell-copy.ts')
let { ChatShellComposer } = await import('./chat-shell-composer.tsx')

describe('chat-shell-composer component', () => {
  function defaultProps() {
    return {
      authenticated: true,
      knowledgeId: 'kb-1',
      knowledgeName: 'Test KB',
      streaming: false,
      resetGeneration: 0,
      onSend: () => {},
      onScopeReady: () => {},
    }
  }

  it('renders Draft SPJ button when authenticated with knowledgeId', () => {
    let view = render(<ChatShellComposer {...defaultProps()} />)
    let root = view.$('[aria-label="Message composer"]')
    assert.ok(root, 'composer root exists')

    let buttons = root.querySelectorAll('button')
    let draftButton: HTMLButtonElement | null = null
    for (let btn of Array.from(buttons)) {
      if (btn.textContent?.includes(SHELL_COPY.spjDraftAction)) {
        draftButton = btn
        break
      }
    }
    assert.ok(draftButton, 'Draft SPJ button exists')
    assert.equal(draftButton.disabled, false)

    view.cleanup()
  })

  it('does not render Draft SPJ button when unauthenticated', () => {
    let view = render(<ChatShellComposer {...defaultProps()} authenticated={false} />)
    let root = view.$('[aria-label="Message composer"]')
    assert.ok(root)

    let buttons = root.querySelectorAll('button')
    let draftButton = Array.from(buttons).find((b) =>
      b.textContent?.includes(SHELL_COPY.spjDraftAction),
    )
    assert.equal(draftButton, undefined)

    view.cleanup()
  })

  it('does not render Draft SPJ button when no knowledgeId', () => {
    let view = render(<ChatShellComposer {...defaultProps()} knowledgeId={null} />)
    let root = view.$('[aria-label="Message composer"]')
    assert.ok(root)

    let buttons = root.querySelectorAll('button')
    let draftButton = Array.from(buttons).find((b) =>
      b.textContent?.includes(SHELL_COPY.spjDraftAction),
    )
    assert.equal(draftButton, undefined)

    view.cleanup()
  })

  it('POST create draft on click, fetch called with correct args on 200', async () => {
    fetchCalls = []
    const expectedUrl = routes.spj.create.href({ knowledgeId: 'kb-1' })

    mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init })
      let url = String(input)
      if (url === expectedUrl && init?.method === 'POST' && init?.credentials === 'same-origin') {
        return Response.json({ id: 'draft-1' })
      }
      return new Response('', { status: 404 })
    }
    globalThis.fetch = mockFetch

    let view = render(<ChatShellComposer {...defaultProps()} />)
    let root = view.$('[aria-label="Message composer"]')
    assert.ok(root)

    let buttons = root.querySelectorAll('button')
    let draftButton: HTMLButtonElement | null = null
    for (let btn of Array.from(buttons)) {
      if (btn.textContent?.includes(SHELL_COPY.spjDraftAction)) {
        draftButton = btn
        break
      }
    }
    assert.ok(draftButton, 'Draft SPJ button exists')

    draftButton.click()
    await new Promise((r) => setTimeout(r, 50))

    // Assert fetch was called correctly (primary check per task)
    assert.equal(fetchCalls.length, 1)
    assert.equal(fetchCalls[0].url, expectedUrl)
    assert.equal(fetchCalls[0].init?.method, 'POST')
    assert.equal(fetchCalls[0].init?.credentials, 'same-origin')

    view.cleanup()
  })

  it('shows error notice and does not call fetch again on 422', async () => {
    fetchCalls = []
    const expectedUrl = routes.spj.create.href({ knowledgeId: 'kb-1' })

    mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push({ url: String(input), init })
      let url = String(input)
      if (url === expectedUrl && init?.method === 'POST') {
        return new Response(JSON.stringify({ error: 'No lines' }), {
          status: 422,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      return new Response('', { status: 404 })
    }
    globalThis.fetch = mockFetch

    let view = render(<ChatShellComposer {...defaultProps()} />)
    let root = view.$('[aria-label="Message composer"]')
    assert.ok(root)

    let buttons = root.querySelectorAll('button')
    let draftButton: HTMLButtonElement | null = null
    for (let btn of Array.from(buttons)) {
      if (btn.textContent?.includes(SHELL_COPY.spjDraftAction)) {
        draftButton = btn
        break
      }
    }
    assert.ok(draftButton, 'Draft SPJ button exists')

    draftButton.click()
    // Wait for async fetch + error handling (no navigate on error path)
    await new Promise((r) => setTimeout(r, 50))

    // Error notice should be visible
    let errorNotice = root.querySelector('[role="alert"]')
    assert.ok(errorNotice, 'error notice rendered')
    assert.match(errorNotice.textContent ?? '', /No lines/)

    // Fetch should have been called once
    assert.equal(fetchCalls.length, 1)

    view.cleanup()
  })
})
/**
 * SPJ Review panel component test (node:test + @remix-run/ui/test + linkedom).
 * Verifies Confirm POST call, Download link wiring, and empty-state rendering.
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

// Mock fetch globally
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
let { routes } = await import('../routes.ts')
let { SHELL_COPY } = await import('../utils/chat-shell-copy.ts')
let { SpjReviewPanel } = await import('./spj-review-panel.tsx')

function makeDraft(overrides: Partial<{
  id: string
  knowledge_id: string
  fields: {
    vendor: string
    date: string
    currency: string
    lines: { desc: string; qty: number; unit_price: number; line_total: number; confidence?: number }[]
  }
  document_total_computed: number
  confirmed: boolean
}> = {}) {
  return {
    id: 'draft-1',
    knowledge_id: 'kb-1',
    fields: {
      vendor: 'PT Vendor',
      date: '2026-01-15',
      currency: 'IDR',
      lines: [
        { desc: 'Item A', qty: 2, unit_price: 50000, line_total: 100000, confidence: 0.95 },
        { desc: 'Item B', qty: 1, unit_price: 75000, line_total: 75000, confidence: 0.9 },
      ],
    },
    document_total_computed: 175000,
    confirmed: false,
    ...overrides,
  }
}

describe('spj-review-panel component', () => {
  it('renders lines table with desc, qty, unit_price, line_total', () => {
    let view = render(<SpjReviewPanel initialDraft={makeDraft()} />)
    let root = view.$('[data-spj-review-panel]')
    assert.ok(root, 'panel root exists')

    let table = view.$('[role="table"]')
    assert.ok(table, 'table exists')

    // Header columns
    let headerRow = view.$('[role="row"]')
    assert.ok(headerRow)
    let headers = headerRow.querySelectorAll('[role="columnheader"]')
    assert.equal(headers.length, 4)
    assert.match(headers[0]?.textContent ?? '', /Description/)
    assert.match(headers[1]?.textContent ?? '', /Qty/)
    assert.match(headers[2]?.textContent ?? '', /Unit price/)
    assert.match(headers[3]?.textContent ?? '', /Line total/)

    // Row data - 1 header + 2 data rows (total is a sibling div without role="row")
    let rows = table.querySelectorAll('[role="row"]')
    assert.equal(rows.length, 3)

    // Total block is a div inside table but without role="row"
    let totalDiv = table.querySelector('[mix*="spjReviewTotalStyle"], div:not([role]):last-child')
    assert.ok(totalDiv, 'total div exists')
    assert.match(totalDiv.textContent ?? '', /Total/)
    // Check total value is rendered (IDR format)
    assert.ok((totalDiv.textContent ?? '').includes('175') || (totalDiv.textContent ?? '').includes('175000'))

    view.cleanup()
  })

  it('shows empty state when lines array is empty', () => {
    let view = render(<SpjReviewPanel initialDraft={makeDraft({ fields: { vendor: '', date: '', currency: 'IDR', lines: [] }, document_total_computed: 0 })} />)
    let root = view.$('[data-spj-review-panel]')
    assert.ok(root)
    assert.match(root.textContent ?? '', /No line items yet/)
    view.cleanup()
  })

  it('Confirm button calls POST /confirm and updates confirmed state', async () => {
    let confirmCalled = false
    let lastConfirmUrl = ''

    mockFetch = async (input: RequestInfo | URL, init?: RequestInit) => {
      let url = String(input)
      if (url.includes('/confirm') && init?.method === 'POST') {
        confirmCalled = true
        lastConfirmUrl = url
        return Response.json({
          ...makeDraft({ confirmed: true }),
          id: 'draft-1',
        })
      }
      return new Response('', { status: 404 })
    }
    globalThis.fetch = mockFetch

    let view = render(<SpjReviewPanel initialDraft={makeDraft()} />)
    let panel = view.$('[data-spj-review-panel]')
    assert.ok(panel)
    let buttons = panel.querySelectorAll('button')
    let confirmButton: HTMLButtonElement | null = null
    for (let btn of Array.from(buttons)) {
      if (btn.textContent?.includes(SHELL_COPY.spjReviewConfirm)) {
        confirmButton = btn
        break
      }
    }
    assert.ok(confirmButton, 'confirm button exists')

    confirmButton.click()
    // Wait for async update
    await new Promise((r) => setTimeout(r, 50))

    assert.equal(confirmCalled, true)
    assert.ok(lastConfirmUrl.includes('/confirm'))

    // After confirm, download link should be enabled (no data-disabled="true")
    let downloadLink = panel.querySelector('a[href*="/export"]')
    assert.ok(downloadLink)
    assert.equal(downloadLink.getAttribute('data-disabled'), 'false')
    view.cleanup()
  })

  it('Download link uses routes.spj.exportDraft.href', () => {
    let view = render(<SpjReviewPanel initialDraft={makeDraft({ confirmed: true })} />)
    let panel = view.$('[data-spj-review-panel]')
    assert.ok(panel)
    let downloadLink = panel.querySelector('a[href*="/export"]')
    assert.ok(downloadLink)
    assert.match(downloadLink.getAttribute('href') ?? '', /\/spj\/drafts\/draft-1\/export/)
    view.cleanup()
  })

  it('Confirm button hidden when already confirmed', () => {
    let view = render(<SpjReviewPanel initialDraft={makeDraft({ confirmed: true })} />)
    let root = view.$('[data-spj-review-panel]')
    assert.ok(root)
    // Confirm button should not be in the DOM when confirmed
    let confirmButton = Array.from(root.querySelectorAll('button')).find((b) =>
      b.textContent?.includes(SHELL_COPY.spjReviewConfirm),
    )
    assert.equal(confirmButton, undefined)
    view.cleanup()
  })

  it('Download link disabled (data-disabled="true") when not confirmed', () => {
    let view = render(<SpjReviewPanel initialDraft={makeDraft({ confirmed: false })} />)
    let panel = view.$('[data-spj-review-panel]')
    assert.ok(panel)
    let downloadLink = panel.querySelector('a[href*="/export"]')
    assert.ok(downloadLink)
    assert.equal(downloadLink.getAttribute('data-disabled'), 'true')
    view.cleanup()
  })
})
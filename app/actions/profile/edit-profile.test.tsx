/**
 * Profile edit panel component test (node:test + @remix-run/ui/test + linkedom).
 * Verifies render, error display, and form structure (§3.5 click-avatar + shell FormField).
 * Note: Form submit interaction tests omitted due to test renderer limitations with on('submit') handlers.
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

// Mock fetch globally (not used directly but shim expects it)
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
let { routes } = await import('../../routes.ts')
let { EditProfilePanel } = await import('./edit-profile.tsx')

function makeProps(overrides: Partial<{
  userName: string
  userEmail: string
  profileImageUrl: string | null
  nameError: string
  avatarError: string
}> = {}) {
  return {
    userName: 'Test User',
    userEmail: 'test@example.com',
    profileImageUrl: null,
    nameError: undefined,
    avatarError: undefined,
    ...overrides,
  }
}

describe('edit-profile-panel component', () => {
  it('renders avatar initials, name, email, and two forms', () => {
    let view = render(<EditProfilePanel {...makeProps()} />)
    let root = view.$('div')! // panel root
    assert.ok(root)

    // Avatar initials
    assert.match(root.textContent ?? '', /TU/)

    // Name and email
    assert.match(root.textContent ?? '', /Test User/)
    assert.match(root.textContent ?? '', /test@example.com/)

    // No Photo/Upload chrome (superseded), no Password (Settings modal)
    assert.doesNotMatch(root.textContent ?? '', /Photo/)
    assert.doesNotMatch(root.textContent ?? '', /Upload/)
    assert.doesNotMatch(root.textContent ?? '', /Password/)

    // Two forms present, no password inputs
    let forms = root.querySelectorAll('form')
    assert.equal(forms.length, 2)
    assert.equal(root.querySelector('input[name="current_password"]'), null)
    assert.equal(root.querySelector('input[name="new_password"]'), null)

    view.cleanup()
  })

  it('renders avatar image when profileImageUrl provided', () => {
    let view = render(<EditProfilePanel {...makeProps({ profileImageUrl: 'https://example.com/avatar.jpg' })} />)
    let root = view.$('div')!
    let img = root.querySelector('img')!
    assert.ok(img)
    assert.equal(img.getAttribute('src'), routes.profile.avatar.href())
    view.cleanup()
  })

  it('avatar is a button with accessible name "Change photo" and hidden file input', () => {
    let view = render(<EditProfilePanel {...makeProps()} />)
    let root = view.$('div')!
    let avatarBtn = root.querySelector('button[type="button"][aria-label="Change photo"]')
    assert.ok(avatarBtn, 'click-avatar button exists')

    // Pencil affordance at rest: Lucide svg sibling inside the avatar wrap
    let wrap = avatarBtn!.parentElement!
    let badgeSvg = wrap.querySelector('svg')
    assert.ok(badgeSvg, 'pencil badge svg present at rest')

    let fileInput = root.querySelector('input[type="file"]') as HTMLInputElement
    assert.ok(fileInput, 'file input exists')
    assert.equal(fileInput.getAttribute('accept'), 'image/jpeg,image/png,image/webp')
    assert.equal(fileInput.getAttribute('name'), 'file')
    // Hidden pattern: rendered, not display:none (opacity/1px box come from css() class)
    assert.notEqual(fileInput.style.display, 'none')
    view.cleanup()
  })

  it('shows avatar error with role=alert when provided', () => {
    let view = render(<EditProfilePanel {...makeProps({ avatarError: 'Invalid file type' })} />)
    let root = view.$('div')!
    assert.match(root.textContent ?? '', /Invalid file type/)
    let alert = root.querySelector('[role="alert"]')!
    assert.ok(alert)
    view.cleanup()
  })

  it('shows name error when provided', () => {
    let view = render(<EditProfilePanel {...makeProps({ nameError: 'Name too long' })} />)
    let root = view.$('div')!
    assert.match(root.textContent ?? '', /Name too long/)
    view.cleanup()
  })

  it('each form has correct action URL and submit button', () => {
    let view = render(<EditProfilePanel {...makeProps()} />)
    let root = view.$('div')!
    let forms = root.querySelectorAll('form')
    assert.equal(forms.length, 2)

    // Avatar form (hidden file input, no visible submit button)
    assert.equal(forms[0].getAttribute('action'), routes.profile.uploadAvatar.href())
    assert.equal(forms[0].getAttribute('enctype'), 'multipart/form-data')
    assert.equal(forms[0].querySelector('button[type="submit"]'), null)

    // Name form
    assert.equal(forms[1].getAttribute('action'), routes.profile.updateName.href())
    let nameBtn = forms[1].querySelector('button[type="submit"]')!
    assert.ok(nameBtn)
    assert.match(nameBtn.textContent ?? '', /Save/)

    view.cleanup()
  })

  it('name form uses shell FormField with defaultValue', () => {
    let view = render(<EditProfilePanel {...makeProps({ userName: 'Jane Doe' })} />)
    let root = view.$('div')!
    let forms = root.querySelectorAll('form')
    let nameForm = forms[1]
    let shellField = nameForm.querySelector('[data-form-field="shell"]')
    assert.ok(shellField, 'shell FormField in name form')
    let nameInput = nameForm.querySelector('input[name="name"]') as HTMLInputElement
    assert.ok(nameInput)
    assert.equal(nameInput.getAttribute('type'), 'text')
    assert.equal(
      nameInput.getAttribute('defaultvalue') ?? nameInput.defaultValue ?? nameInput.getAttribute('value'),
      'Jane Doe',
    )
    view.cleanup()
  })

  it('Cancel link points to profile index', () => {
    let view = render(<EditProfilePanel {...makeProps()} />)
    let root = view.$('div')!
    let cancelLink = root.querySelector('a[href*="/profile"]') as HTMLAnchorElement
    assert.ok(cancelLink)
    assert.match(cancelLink.getAttribute('href') ?? '', /\/profile$/)
    assert.match(cancelLink.textContent ?? '', /Cancel/)
    view.cleanup()
  })

  it('name row shows Cancel before Save; Save is idle "Save", not "Saving…"', () => {
    let view = render(<EditProfilePanel {...makeProps()} />)
    let root = view.$('div')!
    let forms = root.querySelectorAll('form')
    let actions = forms[1].querySelectorAll('a, button[type="submit"]')
    assert.equal(actions.length, 2)
    assert.match(actions[0].textContent ?? '', /Cancel/)
    assert.ok((actions[0] as HTMLAnchorElement).tagName === 'A', 'Cancel is first')
    assert.match(actions[1].textContent ?? '', /Save/)

    // Idle Save text is exactly "Save" (trimmed) — no "Saving…" anywhere at rest
    let saveBtn = forms[1].querySelector('button[type="submit"]')!
    assert.equal((saveBtn.textContent ?? '').trim(), 'Save')
    assert.doesNotMatch(root.textContent ?? '', /Saving/)
    view.cleanup()
  })
})

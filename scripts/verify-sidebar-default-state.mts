/**
 * Fresh-load sidebar default state: guest/auth × desktop(1280)/mobile(390).
 * Viewport is set on the context before goto — never resize an already-loaded page.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:44100'
const stamp = Date.now()
const email = `sidebar.default.${stamp}@example.com`
const password = 'VerifyPass123!'
const name = 'Oh Hyundo'

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }
const DESKTOP_OPEN_MIN = 200
const MOBILE_CLOSED_MAX = 8

type Combo = {
  label: string
  auth: boolean
  viewport: { width: number; height: number }
  expectOpen: boolean
}

type Snapshot = {
  dataOpen: string | null
  trackOpen: string | null
  trackWidth: number
  asideWidth: number
  toggleLabel: string | null
  headerToggleVisible: boolean
  hydration: string[]
}

async function registerSession(): Promise<string[]> {
  let reg = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name, email, password }),
    redirect: 'manual',
  })
  if (reg.status !== 303) {
    throw new Error(`register expected 303, got ${reg.status}`)
  }
  return reg.headers.getSetCookie()
}

async function attachCookies(context: BrowserContext, cookies: string[]) {
  for (let c of cookies) {
    let [nv] = c.split(';')
    let [cookieName, ...rest] = nv.split('=')
    await context.addCookies([
      { name: cookieName!, value: rest.join('='), domain: '127.0.0.1', path: '/' },
    ])
  }
}

async function snapshot(page: Page, errors: string[]): Promise<Snapshot> {
  await page.waitForSelector('aside[aria-label="Chat navigation"]', { timeout: 8000 })
  // Client matchMedia correction happens on clientEntry setup; wait a paint cycle.
  await page.waitForTimeout(900)
  let box = await page.evaluate(() => {
    let aside = document.querySelector('aside[aria-label="Chat navigation"]') as HTMLElement | null
    let track = aside?.parentElement as HTMLElement | null
    let toggle = aside?.querySelector('button[aria-label="Close sidebar"], button[aria-label="Open sidebar"]')
    let headerBtn = document.querySelector('header button[aria-label="Open sidebar"]') as HTMLElement | null
    let headerVisible = false
    if (headerBtn) {
      let cs = getComputedStyle(headerBtn)
      headerVisible = cs.display !== 'none' && cs.visibility !== 'hidden'
    }
    return {
      dataOpen: aside?.getAttribute('data-open') ?? null,
      trackOpen: track?.getAttribute('data-open') ?? null,
      trackWidth: track ? track.getBoundingClientRect().width : -1,
      asideWidth: aside ? aside.getBoundingClientRect().width : -1,
      toggleLabel: toggle?.getAttribute('aria-label') ?? null,
      headerToggleVisible: headerVisible,
    }
  })
  return {
    ...box,
    hydration: errors.filter((line) => /hydrat/i.test(line) || /mismatch/i.test(line)),
  }
}

function assertCombo(combo: Combo, snap: Snapshot) {
  if (snap.hydration.length) {
    throw new Error(`${combo.label}: hydration mismatch\n${snap.hydration.join('\n')}`)
  }
  let open = snap.dataOpen === 'true'
  if (open !== combo.expectOpen) {
    throw new Error(
      `${combo.label}: expected sidebar ${combo.expectOpen ? 'open' : 'closed'}, ` +
        `got data-open=${snap.dataOpen} track=${snap.trackWidth.toFixed(1)}px ` +
        `toggle=${snap.toggleLabel}`,
    )
  }
  if (combo.expectOpen) {
    if (snap.trackWidth < DESKTOP_OPEN_MIN) {
      throw new Error(
        `${combo.label}: open but track width ${snap.trackWidth.toFixed(1)}px (< ${DESKTOP_OPEN_MIN})`,
      )
    }
    if (snap.toggleLabel !== 'Close sidebar') {
      throw new Error(`${combo.label}: expected Close sidebar toggle, got ${snap.toggleLabel}`)
    }
    if (snap.headerToggleVisible) {
      throw new Error(`${combo.label}: header Open sidebar should be hidden on desktop`)
    }
  } else {
    if (snap.trackWidth > MOBILE_CLOSED_MAX) {
      throw new Error(
        `${combo.label}: closed but track width ${snap.trackWidth.toFixed(1)}px (> ${MOBILE_CLOSED_MAX})`,
      )
    }
    if (!snap.headerToggleVisible) {
      throw new Error(`${combo.label}: header Open sidebar should be visible when mobile-closed`)
    }
  }
  console.log(
    `OK ${combo.label}: data-open=${snap.dataOpen} track=${snap.trackWidth.toFixed(1)}px ` +
      `aside=${snap.asideWidth.toFixed(1)}px toggle=${snap.toggleLabel} ` +
      `headerToggle=${snap.headerToggleVisible ? 'visible' : 'hidden'} hydra=0`,
  )
}

async function loadFresh(
  browser: Browser,
  combo: Combo,
  cookies: string[] | null,
): Promise<Snapshot> {
  let context = await browser.newContext({ viewport: combo.viewport })
  if (cookies) await attachCookies(context, cookies)
  let page = await context.newPage()
  let errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  let snap = await snapshot(page, errors)
  await context.close()
  return snap
}

async function main() {
  let combos: Combo[] = [
    { label: 'guest desktop 1280', auth: false, viewport: DESKTOP, expectOpen: true },
    { label: 'guest mobile 390', auth: false, viewport: MOBILE, expectOpen: false },
    { label: 'auth desktop 1280', auth: true, viewport: DESKTOP, expectOpen: true },
    { label: 'auth mobile 390', auth: true, viewport: MOBILE, expectOpen: false },
  ]

  let cookies = await registerSession()
  let browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    for (let combo of combos) {
      let snap = await loadFresh(browser, combo, combo.auth ? cookies : null)
      assertCombo(combo, snap)
    }
    console.log('ALL 4 FRESH-LOAD DEFAULTS PASSED')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

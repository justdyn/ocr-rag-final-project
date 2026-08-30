/**
 * Real login-form POST → 303 → `/` (no cookie injection).
 * Asserts a single account row and zero hydration mismatches.
 */
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:44100'
const stamp = Date.now()
const email = `login.redirect.${stamp}@example.com`
const password = 'VerifyPass123!'
const name = 'Oh Hyeondo'

const DESKTOP = { width: 1280, height: 800 }
const MOBILE = { width: 390, height: 844 }

async function registerAccount(): Promise<void> {
  let reg = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name, email, password }),
    redirect: 'manual',
  })
  if (reg.status !== 303) {
    throw new Error(`register expected 303, got ${reg.status}`)
  }
}

function attachConsole(page: Page): string[] {
  let lines: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') lines.push(msg.text())
  })
  page.on('pageerror', (err) => lines.push(String(err)))
  return lines
}

function hydra(lines: string[]): string[] {
  return lines.filter((line) => /hydrat/i.test(line) || /mismatch/i.test(line))
}

type AccountInfo = {
  missing: boolean
  dataOpen?: string | null
  trackWidth?: number
  visibleTriggers?: number
  visibleNameSpans?: number
}

async function inspectAccount(page: Page): Promise<AccountInfo> {
  return page.evaluate(`(() => {
    let aside = document.querySelector('aside[aria-label="Chat navigation"]');
    if (!aside) return { missing: true };
    let displayed = (el) => {
      while (el && el !== document.body) {
        let cs = getComputedStyle(el);
        if (cs.display === 'none' || cs.visibility === 'hidden') return false;
        el = el.parentElement;
      }
      return true;
    };
    let triggers = [...aside.querySelectorAll('[data-account-trigger]')].filter(displayed);
    let nameSpans = [...aside.querySelectorAll('span')].filter(
      (el) => el.textContent && el.textContent.trim() === 'Oh Hyeondo' && displayed(el),
    );
    let track = aside.parentElement;
    return {
      missing: false,
      dataOpen: aside.getAttribute('data-open'),
      trackWidth: track ? track.getBoundingClientRect().width : -1,
      visibleTriggers: triggers.length,
      visibleNameSpans: nameSpans.length,
    };
  })()`) as Promise<AccountInfo>
}

async function submitLogin(page: Page) {
  await page.locator('#email').fill(email)
  await page.locator('#password').fill(password)
  await Promise.all([
    page.waitForURL((url) => new URL(url).pathname === '/', { timeout: 20000 }),
    page.getByRole('button', { name: 'Sign in' }).click(),
  ])
  await page.waitForSelector('aside[aria-label="Chat navigation"]', { timeout: 8000 })
  await page.waitForTimeout(2500)
}

async function loginFromPath(
  browser: Browser,
  label: string,
  viewport: { width: number; height: number },
  start: 'login' | 'guest-home',
  expectOpen: boolean,
) {
  let context = await browser.newContext({ viewport })
  let page = await context.newPage()
  let errors = attachConsole(page)

  let posts: string[] = []
  page.on('requestfailed', (req) => {
    posts.push(`FAIL ${req.method()} ${req.url()} ${req.failure()?.errorText}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400) posts.push(`HTTP ${res.status()} ${res.url()}`)
  })
  page.on('request', (req) => {
    if (req.method() === 'POST' && req.url().includes('login')) {
      posts.push(`${req.resourceType()} nav=${req.isNavigationRequest()} ${req.url()}`)
    }
    if (req.method() === 'GET' && new URL(req.url()).pathname === '/') {
      posts.push(`GET / ${req.resourceType()} nav=${req.isNavigationRequest()}`)
    }
  })

  if (start === 'login') {
    await page.goto(`${BASE}/login`, { waitUntil: 'load' })
  } else {
    await page.goto(`${BASE}/`, { waitUntil: 'load' })
    await page.waitForTimeout(400)
    await page.getByRole('link', { name: 'Log in' }).first().click()
    await page.waitForURL((url) => new URL(url).pathname === '/login', { timeout: 15000 })
    await page.waitForTimeout(400)
  }

  await submitLogin(page)
  if (expectOpen) {
    await page
      .locator('aside[aria-label="Chat navigation"]')
      .getByRole('button', { name: 'Close sidebar' })
      .waitFor({ state: 'attached', timeout: 8000 })
      .catch(async () => {
        let debug = await page.evaluate(`({
          dataOpen: document.querySelector('aside[aria-label="Chat navigation"]') && document.querySelector('aside[aria-label="Chat navigation"]').getAttribute('data-open'),
          toggle: (document.querySelector('aside[aria-label="Chat navigation"] button[aria-label="Close sidebar"], aside[aria-label="Chat navigation"] button[aria-label="Open sidebar"]')||{}).getAttribute && document.querySelector('aside[aria-label="Chat navigation"] button[aria-label="Close sidebar"], aside[aria-label="Chat navigation"] button[aria-label="Open sidebar"]').getAttribute('aria-label'),
          posts: true,
        })`)
        throw new Error(`${label}: desktop sidebar did not open (${JSON.stringify(debug)}) posts=${posts.join('|')}`)
      })
  }
  let info = await inspectAccount(page)
  let mismatches = hydra(errors)

  if (info.missing) throw new Error(`${label}: sidebar missing`)
  if (mismatches.length) {
    throw new Error(`${label}: hydration mismatch\n${mismatches.join('\n')}`)
  }
  if (info.visibleTriggers !== 1) {
    throw new Error(`${label}: expected 1 account trigger, got ${info.visibleTriggers}`)
  }
  if (info.visibleNameSpans !== 1) {
    throw new Error(
      `${label}: expected 1 visible "Oh Hyeondo" span, got ${info.visibleNameSpans} ` +
        `(duplicate account row)`,
    )
  }
  let open = info.dataOpen === 'true'
  if (open !== expectOpen) {
    throw new Error(
      `${label}: expected sidebar ${expectOpen ? 'open' : 'closed'}, ` +
        `got data-open=${info.dataOpen} track=${info.trackWidth}`,
    )
  }

  console.log(
    `OK ${label}: triggers=${info.visibleTriggers} names=${info.visibleNameSpans} ` +
      `data-open=${info.dataOpen} track=${(info.trackWidth ?? -1).toFixed(1)} hydra=0`,
  )

  if (expectOpen) {
    await assertClosedStaysClosedOnNav(page, label, errors)
  }

  await context.close()
}

async function assertClosedStaysClosedOnNav(page: Page, label: string, errors: string[]) {
  let aside = page.locator('aside[aria-label="Chat navigation"]')
  await aside.getByRole('button', { name: 'Close sidebar' }).click()
  await page.waitForTimeout(500)
  let afterClose = await inspectAccount(page)
  if (afterClose.dataOpen !== 'false') {
    throw new Error(`${label}: expected closed after toggle, got data-open=${afterClose.dataOpen}`)
  }
  await aside.getByRole('link', { name: 'New chat' }).click()
  await page.waitForTimeout(1500)
  let afterNav = await inspectAccount(page)
  if (afterNav.dataOpen !== 'false') {
    throw new Error(
      `${label}: sidebar re-opened on New chat nav (overcorrect) data-open=${afterNav.dataOpen}`,
    )
  }
  let mismatches = hydra(errors)
  if (mismatches.length) {
    throw new Error(`${label}: hydration mismatch after New chat\n${mismatches.join('\n')}`)
  }
  console.log(
    `OK ${label} stayed closed after New chat: data-open=${afterNav.dataOpen} ` +
      `track=${afterNav.trackWidth?.toFixed(1)}`,
  )
}

async function guestFresh(
  browser: Browser,
  label: string,
  viewport: { width: number; height: number },
  expectOpen: boolean,
) {
  let context = await browser.newContext({ viewport })
  let page = await context.newPage()
  let errors = attachConsole(page)
  await page.goto(`${BASE}/`, { waitUntil: 'load' })
  await page.waitForSelector('aside[aria-label="Chat navigation"]', { timeout: 8000 })
  if (expectOpen) {
    await page
      .locator('aside[aria-label="Chat navigation"]')
      .getByRole('button', { name: 'Close sidebar' })
      .waitFor({ state: 'attached', timeout: 8000 })
  } else {
    await page.waitForTimeout(900)
  }
  let info = (await page.evaluate(`(() => {
    let aside = document.querySelector('aside[aria-label="Chat navigation"]');
    let track = aside && aside.parentElement;
    return {
      dataOpen: aside ? aside.getAttribute('data-open') : null,
      trackWidth: track ? track.getBoundingClientRect().width : -1,
    };
  })()`)) as { dataOpen: string | null; trackWidth: number }
  let mismatches = hydra(errors)
  if (mismatches.length) throw new Error(`${label}: hydration mismatch\n${mismatches.join('\n')}`)
  let open = info.dataOpen === 'true'
  if (open !== expectOpen) {
    throw new Error(`${label}: expected ${expectOpen ? 'open' : 'closed'}, got ${info.dataOpen}`)
  }
  console.log(`OK ${label}: data-open=${info.dataOpen} track=${info.trackWidth.toFixed(1)} hydra=0`)
  await context.close()
}

async function main() {
  await registerAccount()
  let browser = await chromium.launch({
    headless: true,
    channel: process.env.PW_CHANNEL || undefined,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  try {
    await loginFromPath(browser, 'real login desktop (direct /login)', DESKTOP, 'login', true)
    await loginFromPath(
      browser,
      'real login desktop (guest home → Log in)',
      DESKTOP,
      'guest-home',
      true,
    )
    await loginFromPath(browser, 'real login mobile 390 (direct /login)', MOBILE, 'login', false)

    await guestFresh(browser, 'guest desktop 1280', DESKTOP, true)
    await guestFresh(browser, 'guest mobile 390', MOBILE, false)

    console.log('ALL LOGIN-FLOW + FRESH-LOAD CHECKS PASSED')
  } finally {
    await browser.close()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

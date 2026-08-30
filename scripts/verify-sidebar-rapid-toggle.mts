/**
 * Live verification: rapid sidebar toggle (the confirmed hydration-mismatch trigger),
 * plus previously checked flows (mobile default-closed, account menu, header collision).
 */
import { chromium, type Page } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:44104'
const stamp = Date.now()
const email = `rapid.toggle.${stamp}@example.com`
const password = 'VerifyPass123!'
const name = 'Oh Hyundo'

type Box = { x: number; y: number; width: number; height: number }

function overlaps(a: Box, b: Box): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  )
}

async function registerSession(): Promise<string[]> {
  let reg = await fetch(`${BASE}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ name, email, password }),
    redirect: 'manual',
  })
  if (reg.status !== 303) throw new Error(`register expected 303, got ${reg.status}`)
  return reg.headers.getSetCookie()
}

async function headerTags(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    let header = document.querySelector('aside[aria-label="Chat navigation"] > div')
    return header ? [...header.children].map((el) => el.tagName.toLowerCase()) : []
  })
}

async function asideChildTags(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    let aside = document.querySelector('aside[aria-label="Chat navigation"]')
    return aside ? [...aside.children].map((el) => el.tagName.toLowerCase()) : []
  })
}

async function clickSidebarToggle(page: Page) {
  let aside = page.locator('aside[aria-label="Chat navigation"]')
  let closeBtn = aside.getByRole('button', { name: 'Close sidebar' })
  let openBtn = aside.getByRole('button', { name: 'Open sidebar' })
  if (await closeBtn.count()) {
    await closeBtn.click({ force: true, timeout: 4000 })
    return 'Close sidebar'
  }
  await openBtn.click({ force: true, timeout: 4000 })
  return 'Open sidebar'
}

async function rapidToggle(
  page: Page,
  clicks: number,
  errors: string[],
  expectGuestCta: boolean,
) {
  let baseline = [...(await asideChildTags(page))].join(',')
  for (let n = 1; n <= clicks; n++) {
    let before = errors.length
    let label = await clickSidebarToggle(page)
    await page.waitForTimeout(40)
    let tags = await headerTags(page)
    if (tags.join(',') !== 'a,button') {
      throw new Error(`click ${n} (${label}): header tags drifted to [${tags.join(',')}]`)
    }
    let hydra = errors.slice(before).filter((line) => /hydrat/i.test(line) || /mismatch/i.test(line))
    if (hydra.length) {
      throw new Error(`click ${n} (${label}): ${hydra.join(' | ')}`)
    }
    if (expectGuestCta) {
      let aside = await asideChildTags(page)
      if (aside[aside.length - 1] !== 'div') {
        throw new Error(
          `click ${n} (${label}): guest CTA root missing (aside=[${aside.join(',')}])`,
        )
      }
    }
    console.log(`OK click ${n} ${label} header=[${tags.join(',')}] aside-shape-ok vs ${baseline}`)
  }
}

async function assertNoHeaderCollision(page: Page, label: string) {
  let openBtn = page.locator('header').getByRole('button', { name: 'Open sidebar' })
  let title = page.locator('header').getByText('Remix', { exact: true }).first()
  await openBtn.waitFor({ state: 'visible', timeout: 5000 })
  await title.waitFor({ state: 'visible', timeout: 5000 })
  let a = await openBtn.boundingBox()
  let b = await title.boundingBox()
  if (!a || !b) throw new Error(`${label}: missing bounding boxes`)
  if (a.x < 0) throw new Error(`${label}: header Open sidebar is off-screen (x=${a.x})`)
  if (overlaps(a, b)) {
    throw new Error(`${label}: Open sidebar overlaps Remix title`)
  }
  if (b.x < a.x + a.width - 0.5) {
    throw new Error(`${label}: title does not sit to the right of the toggle`)
  }
  console.log(`OK ${label}: no overlap (btn.x=${a.x.toFixed(1)} title.x=${b.x.toFixed(1)})`)
}

async function attachCookies(
  context: Awaited<ReturnType<Awaited<ReturnType<typeof chromium.launch>>['newContext']>>,
  cookies: string[],
) {
  for (let c of cookies) {
    let [nv] = c.split(';')
    let [cookieName, ...rest] = nv.split('=')
    await context.addCookies([
      { name: cookieName!, value: rest.join('='), domain: '127.0.0.1', path: '/' },
    ])
  }
}

async function main() {
  let browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })

  // --- Guest desktop: 6 rapid toggles ---
  let guestCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  let guestPage = await guestCtx.newPage()
  let guestErrors: string[] = []
  guestPage.on('console', (msg) => {
    if (msg.type() === 'error') guestErrors.push(msg.text())
  })
  guestPage.on('pageerror', (err) => guestErrors.push(String(err)))
  await guestPage.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await guestPage.waitForTimeout(700)
  let paintHydra = guestErrors.filter((line) => /hydrat/i.test(line) || /mismatch/i.test(line))
  if (paintHydra.length) throw new Error(`Guest first paint:\n${paintHydra.join('\n')}`)
  if ((await headerTags(guestPage)).join(',') !== 'a,button') {
    throw new Error(`Guest first paint header tags: ${(await headerTags(guestPage)).join(',')}`)
  }
  console.log('OK guest desktop first paint: header=[a,button], no hydration mismatch')
  await rapidToggle(guestPage, 6, guestErrors, true)
  await guestCtx.close()

  // --- Auth desktop: 6 rapid toggles + account menu ---
  let cookies = await registerSession()
  let authCtx = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  await attachCookies(authCtx, cookies)
  let authPage = await authCtx.newPage()
  let authErrors: string[] = []
  authPage.on('console', (msg) => {
    if (msg.type() === 'error') authErrors.push(msg.text())
  })
  authPage.on('pageerror', (err) => authErrors.push(String(err)))
  await authPage.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await authPage.waitForTimeout(700)
  paintHydra = authErrors.filter((line) => /hydrat/i.test(line) || /mismatch/i.test(line))
  if (paintHydra.length) throw new Error(`Auth first paint:\n${paintHydra.join('\n')}`)
  console.log('OK auth desktop first paint: no hydration mismatch')
  await rapidToggle(authPage, 6, authErrors, false)

  let accountBtn = authPage.getByRole('button', { name: /Account menu for Oh Hyundo/i })
  await accountBtn.waitFor({ state: 'visible', timeout: 8000 })
  await accountBtn.click()
  await authPage.getByRole('menu', { name: 'Account menu' }).waitFor({ state: 'visible' })
  console.log('OK auth: account menu opens')
  await authPage.keyboard.press('Escape')
  await authPage.waitForTimeout(300)
  await authPage.getByRole('menu', { name: 'Account menu' }).waitFor({ state: 'hidden' })
  console.log('OK auth: account menu closes')

  // --- Mobile default-closed + header collision + rapid open/close via header+sidebar ---
  await authPage.setViewportSize({ width: 390, height: 844 })
  await authPage.waitForTimeout(700)
  await authPage.waitForFunction(() => {
    return document.querySelector('aside[aria-label="Chat navigation"]')?.getAttribute('data-open') === 'false'
  })
  await assertNoHeaderCollision(authPage, 'mobile-closed')
  for (let n = 1; n <= 5; n++) {
    let before = authErrors.length
    await authPage.locator('header').getByRole('button', { name: 'Open sidebar' }).click()
    await authPage.waitForTimeout(200)
    await authPage
      .locator('aside[aria-label="Chat navigation"]')
      .getByRole('button', { name: 'Close sidebar' })
      .click({ force: true })
    await authPage.waitForTimeout(200)
    let hydra = authErrors
      .slice(before)
      .filter((line) => /hydrat/i.test(line) || /mismatch/i.test(line))
    if (hydra.length) throw new Error(`mobile cycle ${n}: ${hydra.join(' | ')}`)
    console.log(`OK mobile cycle ${n}: header-open + sidebar-close`)
  }
  await assertNoHeaderCollision(authPage, 'mobile-after-rapid')

  let allHydra = [...guestErrors, ...authErrors].filter(
    (line) => /hydrat/i.test(line) || /mismatch/i.test(line),
  )
  if (allHydra.length) throw new Error(`Hydration/console errors:\n${allHydra.join('\n')}`)
  console.log('OK zero hydration mismatches across all sequences')

  await authCtx.close()
  await browser.close()
  console.log('ALL CHECKS PASSED')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

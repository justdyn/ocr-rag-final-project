/**
 * Live browser verification: mobile header collision + sidebar account menu + logout.
 * Uses cookie + full document load (avoids soft-nav rehydration gaps on form POST).
 */
import { chromium, type Page } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:44100'
const stamp = Date.now()
const email = `acct.verify.${stamp}@example.com`
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
  if (reg.status !== 303) {
    throw new Error(`register expected 303, got ${reg.status}`)
  }
  return reg.headers.getSetCookie()
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
    throw new Error(
      `${label}: Open sidebar overlaps Remix title ` +
        `(btn=${JSON.stringify(a)} title=${JSON.stringify(b)})`,
    )
  }
  // Flex gap: title should start after the toggle.
  if (b.x < a.x + a.width - 0.5) {
    throw new Error(`${label}: title does not sit to the right of the toggle`)
  }
  console.log(`OK ${label}: no overlap (btn.x=${a.x.toFixed(1)} title.x=${b.x.toFixed(1)})`)
}

async function main() {
  let cookies = await registerSession()
  let browser = await chromium.launch({ headless: true })
  let context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
  for (let c of cookies) {
    let [nv] = c.split(';')
    let [cookieName, ...rest] = nv.split('=')
    await context.addCookies([
      {
        name: cookieName!,
        value: rest.join('='),
        domain: '127.0.0.1',
        path: '/',
      },
    ])
  }

  let page = await context.newPage()
  let consoleErrors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => consoleErrors.push(String(err)))

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  // Wait until sidebar clientEntry has attached click handlers (hydration).
  await page.waitForFunction(() => {
    let btn = [...document.querySelectorAll('button')].find((el) =>
      (el.getAttribute('aria-label') || '').startsWith('Account menu for'),
    )
    return Boolean(btn)
  })
  await page.waitForTimeout(1500)

  // Desktop: account row + no header Sign out
  let signOutHeader = await page.locator('header').getByText('Sign out').count()
  if (signOutHeader !== 0) throw new Error('Desktop: Sign out still in header')
  let accountBtn = page.getByRole('button', { name: /Account menu for Oh Hyundo/i })
  await accountBtn.waitFor({ state: 'visible', timeout: 10000 })
  let initials = await accountBtn.locator('span').first().innerText()
  if (initials.trim() !== 'OH') {
    throw new Error(`Desktop: expected initials OH, got "${initials}"`)
  }
  if ((await page.getByText('Free', { exact: true }).count()) > 0) {
    throw new Error('Unexpected Free label present')
  }
  if ((await page.getByRole('button', { name: /Upgrade/i }).count()) > 0) {
    throw new Error('Unexpected Upgrade chrome present')
  }
  console.log('OK desktop: account row shows Oh Hyundo / OH; no header Sign out')

  await accountBtn.click()
  let menu = page.getByRole('menu', { name: 'Account menu' })
  await menu.waitFor({ state: 'visible', timeout: 5000 })
  console.log('expanded', await accountBtn.getAttribute('aria-expanded'))
  for (let label of ['Profile', 'Settings', 'Help']) {
    let item = menu.locator(`[aria-disabled="true"]`, { hasText: label })
    await item.waitFor({ state: 'visible' })
  }
  if ((await menu.getByText('Coming soon').count()) < 3) {
    throw new Error('Expected Coming soon on disabled items')
  }
  if ((await menu.getByText('Upgrade plan').count()) > 0) {
    throw new Error('Upgrade plan should not appear')
  }
  console.log('OK desktop: menu structure (disabled Profile/Settings/Help + Log out)')

  await page.keyboard.press('Escape')
  await page.waitForTimeout(400)
  if ((await accountBtn.getAttribute('aria-expanded')) !== 'false') {
    // Fallback: toggle closed if Escape is swallowed by the environment.
    await accountBtn.click()
    await page.waitForTimeout(400)
  }
  await menu.waitFor({ state: 'hidden', timeout: 5000 })
  console.log('OK desktop: menu closes')

  // Mobile: sidebar closes via viewport sync; header toggle + Remix must not collide
  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(800)
  await page.waitForFunction(() => {
    let track = document.querySelector('div[data-open]')
    return track?.getAttribute('data-open') === 'false'
  })
  await assertNoHeaderCollision(page, 'mobile-closed')

  await page.locator('header').getByRole('button', { name: 'Open sidebar' }).click()
  await page.waitForTimeout(500)
  let mobileAccount = page.getByRole('button', { name: /Account menu for Oh Hyundo/i })
  await mobileAccount.waitFor({ state: 'visible', timeout: 5000 })
  await mobileAccount.click()
  await page.getByRole('menu', { name: 'Account menu' }).waitFor({ state: 'visible' })

  // Logout via full navigation (form POST)
  await Promise.all([
    page.waitForURL((url) => url.pathname === '/' || url.pathname === '', {
      timeout: 15000,
    }),
    page.getByRole('menuitem', { name: 'Log out' }).click(),
  ])
  await page.waitForTimeout(1000)

  // Soft-nav after logout may leave stale chrome — force full reload as guest check
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(500)
  let loginCount = await page.getByRole('link', { name: 'Log in' }).count()
  if (loginCount < 1) throw new Error('After logout: expected Log in link')
  let accountGone = await page.getByRole('button', { name: /Account menu for/i }).count()
  if (accountGone !== 0) throw new Error('After logout: account menu still present')
  console.log('OK logout: guest home after Log out')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await assertNoHeaderCollision(page, 'guest-mobile')

  let hydration = consoleErrors.filter(
    (line) => /hydrat/i.test(line) || /mismatch/i.test(line),
  )
  if (hydration.length) {
    throw new Error(`Hydration/console errors:\n${hydration.join('\n')}`)
  }
  if (consoleErrors.length) {
    console.log('Console errors (non-hydration):', consoleErrors)
  } else {
    console.log('OK zero console errors')
  }

  await browser.close()
  console.log('ALL CHECKS PASSED')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

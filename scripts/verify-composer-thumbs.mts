/**
 * Live browser verification: mobile-closed sidebar, composer thumbnail strip,
 * XHR progress rings, typing during upload, header collision, soft-nav reset.
 */
import { chromium, type Page } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:44100'
const stamp = Date.now()
const email = `thumbs.verify.${stamp}@example.com`
const password = 'VerifyPass123!'
const name = 'Thumb Verify'

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)

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
  if (b.x < a.x + a.width - 0.5) {
    throw new Error(`${label}: title does not sit to the right of the toggle`)
  }
  console.log(`OK ${label}: no overlap (btn.x=${a.x.toFixed(1)} title.x=${b.x.toFixed(1)})`)
}

async function main() {
  console.log('registering session…')
  let cookies = await registerSession()
  console.log('launching chromium…')
  let browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
  console.log('chromium launched')
  let context = await browser.newContext({ viewport: { width: 390, height: 844 } })
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

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  let aside = page.locator('aside[aria-label="Chat navigation"]')
  await aside.waitFor({ state: 'attached', timeout: 8000 })
  let ssrOpen = await aside.getAttribute('data-open')
  if (ssrOpen !== 'false') {
    throw new Error(`Mobile first paint: expected sidebar data-open=false, got ${ssrOpen}`)
  }
  console.log('OK mobile-first: sidebar closed on first paint (max-width 900px)')

  await page.waitForTimeout(800)
  if ((await aside.getAttribute('data-open')) !== 'false') {
    throw new Error('Mobile after hydrate: sidebar opened unexpectedly')
  }
  await assertNoHeaderCollision(page, 'mobile-closed')

  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.waitForTimeout(600)
  await page.waitForFunction(() => {
    let el = document.querySelector('aside[aria-label="Chat navigation"]')
    return el?.getAttribute('data-open') === 'true'
  })
  console.log('OK desktop: sidebar opens after crossing 900px')

  await page.getByRole('link', { name: 'New chat' }).click()
  await page.waitForTimeout(300)
  console.log('OK soft-nav: New chat click did not throw')

  let cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 80,
    downloadThroughput: 80 * 1024,
    uploadThroughput: 8 * 1024,
    connectionType: 'cellular3g',
  })

  let fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: PNG_1x1 },
    { name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.alloc(180_000, 97) },
  ])

  let strip = page.getByRole('list', { name: 'Attached files' })
  await strip.waitFor({ state: 'visible', timeout: 8000 })
  let thumbs = strip.locator('li')
  await thumbs.first().waitFor({ state: 'visible' })
  if ((await thumbs.count()) < 2) {
    throw new Error(`Expected 2 thumbnails, got ${await thumbs.count()}`)
  }
  let imgCount = await strip.locator('img').count()
  if (imgCount < 1) throw new Error('Expected an image preview thumbnail for photo.png')
  console.log(`OK strip: ${await thumbs.count()} thumbs, ${imgCount} image preview(s)`)

  let txtThumb = strip.locator('li').filter({ hasNot: page.locator('img') }).first()
  let bar = txtThumb.getByRole('progressbar')
  await bar.waitFor({ state: 'visible', timeout: 5000 })
  let ring = bar.locator('circle').nth(1)
  let offsets = new Set<string>()
  let percents = new Set<string>()
  let box = page.locator('textarea[name="message"]')
  await box.click()
  let typed = 'typing during upload stays live'
  let typeDone = box.pressSequentially(typed, { delay: 25 })
  for (let i = 0; i < 50; i++) {
    let value = await ring.getAttribute('stroke-dashoffset')
    if (value) offsets.add(value)
    let marked = await bar.getAttribute('data-progress')
    if (marked) percents.add(marked)
    await page.waitForTimeout(100)
  }
  await typeDone
  let determinate = [...percents].filter((v) => v !== 'indeterminate')
  if (offsets.size < 2 && determinate.length < 2) {
    throw new Error(
      `Progress ring did not animate (offsets=${[...offsets].join('|')} data-progress=${[...percents].join('|')})`,
    )
  }
  console.log(
    `OK progress: ${offsets.size} ring offsets, progress marks=${[...percents].join(',')}`,
  )

  let live = await box.inputValue()
  if (live !== typed) {
    throw new Error(`Typing jank: expected "${typed}", got "${live}"`)
  }
  console.log('OK typing: textarea kept every character during upload')

  await page.getByRole('link', { name: 'New chat' }).click()
  await page.waitForTimeout(400)
  if ((await strip.count()) !== 0 && (await strip.isVisible().catch(() => false))) {
    throw new Error('New chat should clear the attachment strip')
  }
  console.log('OK New chat: attachment strip unmounted (scope reset)')

  await page.setViewportSize({ width: 390, height: 844 })
  await page.waitForTimeout(500)
  await page.waitForFunction(() => {
    let el = document.querySelector('aside[aria-label="Chat navigation"]')
    return el?.getAttribute('data-open') === 'false'
  })
  await assertNoHeaderCollision(page, 'mobile-after-desktop')

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

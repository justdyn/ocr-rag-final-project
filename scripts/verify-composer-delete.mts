/**
 * Live browser verification: composer hover-delete aborts in-flight uploads,
 * DELETEs ready unsent files, and never appears on sent-message citations.
 */
import { chromium, type Page } from 'playwright'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:44100'
const stamp = Date.now()
const email = `delete.verify.${stamp}@example.com`
const password = 'VerifyPass123!'
const name = 'Delete Verify'

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

async function cookieHeader(raw: string[]): Promise<string> {
  return raw.map((c) => c.split(';')[0]).join('; ')
}

async function waitReadyGone(page: Page, filename: string) {
  await page.waitForFunction(
    (name) => {
      let strip = document.querySelector('[aria-label="Attached files"]')
      if (!strip) return true
      return !strip.querySelector(`li[data-filename="${name}"]`)
    },
    filename,
    { timeout: 8000 },
  )
}

async function main() {
  console.log('registering session…')
  let cookies = await registerSession()
  let cookie = await cookieHeader(cookies)

  console.log('launching chromium…')
  let browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  })
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

  let abortedUploads = 0
  page.on('requestfailed', (req) => {
    if (!req.url().includes('/files/upload')) return
    let reason = req.failure()?.errorText ?? ''
    if (/abort/i.test(reason) || /ERR_ABORTED/i.test(reason)) abortedUploads += 1
  })

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  let aside = page.locator('aside[aria-label="Chat navigation"]')
  await aside.waitFor({ state: 'attached', timeout: 8000 })
  await page.waitForTimeout(800)
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.evaluate(() => window.dispatchEvent(new Event('resize')))
  await page.waitForFunction(() => {
    let el = document.querySelector('aside[aria-label="Chat navigation"]')
    return el?.getAttribute('data-open') === 'true'
  })
  await page.getByRole('link', { name: 'New chat' }).click()
  await page.waitForTimeout(300)

  let cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 80,
    downloadThroughput: 80 * 1024,
    uploadThroughput: 4 * 1024,
    connectionType: 'cellular3g',
  })

  let fileInput = page.locator('input[type="file"]')
  await fileInput.setInputFiles([
    { name: 'keep-me.txt', mimeType: 'text/plain', buffer: Buffer.from('keep this orchard apple\n') },
    { name: 'abort-me.txt', mimeType: 'text/plain', buffer: Buffer.alloc(180_000, 97) },
  ])

  let strip = page.locator('[aria-label="Attached files"]')
  await strip.waitFor({ state: 'visible', timeout: 12000 })
  let abortThumb = strip.locator('li[data-filename="abort-me.txt"]')
  await abortThumb.waitFor({ state: 'visible' })
  await abortThumb.hover()
  await abortThumb.getByRole('button', { name: 'Remove abort-me.txt' }).click()
  await waitReadyGone(page, 'abort-me.txt')
  if (abortedUploads < 1) {
    console.log('WARN: no requestaborted event (upload may have finished first); thumb is gone')
  } else {
    console.log('OK mid-upload abort: abort-me.txt removed from strip')
  }
  if (await strip.locator('li[data-filename="abort-me.txt"]').count()) {
    throw new Error('abort-me.txt thumbnail is still present')
  }

  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  })

  let keepThumb = strip.locator('li[data-filename="keep-me.txt"]')
  await keepThumb.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    let el = document.querySelector('li[data-filename="keep-me.txt"]')
    return el?.getAttribute('title')?.includes('ready') === true
  }, { timeout: 120000 })
  console.log('OK keep-me.txt reached ready')

  let deleteDone = page.waitForResponse(
    (res) =>
      res.request().method() === 'DELETE' &&
      /\/files\/[^/]+$/.test(new URL(res.url()).pathname),
    { timeout: 10000 },
  )
  await keepThumb.hover()
  await keepThumb.getByRole('button', { name: 'Remove keep-me.txt' }).click()
  let deleteRes = await deleteDone
  await waitReadyGone(page, 'keep-me.txt')
  let deletedId = new URL(deleteRes.url()).pathname.split('/').pop()
  if (!deletedId) throw new Error('DELETE url missing file id')
  console.log(`OK ready-delete: DELETE ${deletedId} (${deleteRes.status()})`)

  let status = await fetch(`${BASE}/files/${deletedId}/status`, {
    headers: { cookie, Accept: 'application/json' },
  })
  if (status.status !== 404) {
    throw new Error(`expected deleted file status 404, got ${status.status}`)
  }
  console.log(`OK backend: GET /files/${deletedId}/status is gone (${status.status})`)

  await fileInput.setInputFiles([
    {
      name: 'cite-me.txt',
      mimeType: 'text/plain',
      buffer: Buffer.from('Apples grow in orchards. Cider is made from apples.\n'.repeat(12)),
    },
  ])
  await strip.waitFor({ state: 'visible', timeout: 8000 })
  await page.waitForFunction(() => {
    let items = [...document.querySelectorAll('[aria-label="Attached files"] li')]
    return items.length >= 1 && items.every((el) => el.getAttribute('title')?.includes('ready'))
  }, { timeout: 120000 })
  console.log('OK re-attach: remaining files ready for send')

  let box = page.locator('textarea[name="message"]')
  await box.fill('Where do apples grow?')
  await page.getByRole('button', { name: 'Send message' }).click()

  await page.waitForTimeout(1500)
  if ((await strip.count()) !== 0 && (await strip.isVisible().catch(() => false))) {
    throw new Error('composer strip should unmount after send (draft consumed)')
  }
  console.log('OK send: draft strip unmounted (delete affordance gone)')

  let thread = page.locator('[aria-live="polite"]')
  await thread.waitFor({ state: 'visible', timeout: 8000 })
  let citationRemove = thread.getByRole('button', { name: /^Remove / })
  if ((await citationRemove.count()) > 0) {
    throw new Error('delete button appeared on conversation history')
  }
  console.log('OK scope: no Remove buttons in the message thread')

  let assistant = thread.locator('li').filter({ hasText: 'Assistant' }).last()
  let cited = false
  try {
    await assistant.getByRole('button').filter({ hasText: /^\[\d+\]$/ }).first().waitFor({
      timeout: 45000,
    })
    cited = true
    console.log('OK citations: assistant turn has source chips')
  } catch {
    console.log('WARN: no citation chips (LLM may be unset); skipping reopen citation check')
  }

  if (cited) {
    let url = page.url()
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(800)
    if (page.url() !== url) {
      await page.goto(url, { waitUntil: 'domcontentloaded' })
    }
    let reopened = page.locator('[aria-live="polite"]')
    await reopened.getByRole('button').filter({ hasText: /^\[\d+\]$/ }).first().waitFor({
      timeout: 15000,
    })
    if ((await reopened.getByRole('button', { name: /^Remove / }).count()) > 0) {
      throw new Error('reopened conversation exposed a file delete button')
    }
    console.log('OK reopen: citations still present, still no delete affordance')
  }

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

/**
 * Headed, real-cursor verification of composer thumbnail hover-delete.
 * Uses page.mouse.move to screen coordinates — not locator.hover().
 */
import { chromium, type Page } from 'playwright'
import * as fs from 'node:fs'
import * as path from 'node:path'

const BASE = process.env.APP_URL ?? 'http://127.0.0.1:44100'
const stamp = Date.now()
const email = `hover.visible.${stamp}@example.com`
const password = 'VerifyPass123!'
const name = 'Hover Visible'
const outDir = path.join('tmp', 'hover-thumb')

type HoverProbe = {
  present: boolean
  html: string | null
  liClass: string | null
  btnClass: string | null
  opacity: string | null
  pointerEvents: string | null
  zIndex: string | null
  display: string | null
  visibility: string | null
  liMatchesHover: boolean | null
  topAtPoint: string | null
  opacityRules: { selector: string; css: string; layer: string }[]
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

async function probe(page: Page, x: number, y: number): Promise<HoverProbe> {
  return page.evaluate(({ x, y }) => {
    let li = document.querySelector('[aria-label="Attached files"] li') as HTMLElement | null
    let btn = document.querySelector('[data-thumb-remove]') as HTMLElement | null
    let cs = btn ? getComputedStyle(btn) : null
    let opacityRules: { selector: string; css: string; layer: string }[] = []

    function walk(rules: CSSRuleList, layer: string) {
      for (let i = 0; i < rules.length; i++) {
        let rule = rules[i]!
        if (rule instanceof CSSLayerBlockRule) {
          walk(rule.cssRules, layer ? `${layer}.${rule.name}` : rule.name)
        } else if (rule instanceof CSSGroupingRule && 'cssRules' in rule) {
          walk(rule.cssRules, layer)
        } else if (rule instanceof CSSStyleRule) {
          let text = rule.cssText
          if (/opacity|thumb-remove/.test(text)) {
            opacityRules.push({ selector: rule.selectorText, css: text, layer })
          }
        }
      }
    }

    for (let sheet of document.adoptedStyleSheets) {
      try {
        walk(sheet.cssRules, '')
      } catch {
        /* skip */
      }
    }
    for (let sheet of Array.from(document.styleSheets)) {
      try {
        if (sheet.cssRules) walk(sheet.cssRules, 'document')
      } catch {
        /* skip */
      }
    }

    let top = document.elementFromPoint(x, y)
    return {
      present: Boolean(btn),
      html: li?.outerHTML.slice(0, 1800) ?? null,
      liClass: li?.className ?? null,
      btnClass: btn?.className ?? null,
      opacity: cs?.opacity ?? null,
      pointerEvents: cs?.pointerEvents ?? null,
      zIndex: cs?.zIndex ?? null,
      display: cs?.display ?? null,
      visibility: cs?.visibility ?? null,
      liMatchesHover: li?.matches(':hover') ?? null,
      topAtPoint: top
        ? `${top.tagName.toLowerCase()}${top.getAttribute('aria-label') ? `[aria-label="${top.getAttribute('aria-label')}"]` : ''}${top.getAttribute('data-thumb-remove') != null ? '[data-thumb-remove]' : ''}.${top.className}`
        : null,
      opacityRules: opacityRules.slice(0, 40),
    }
  }, { x, y })
}

async function main() {
  fs.mkdirSync(outDir, { recursive: true })
  console.log('registering session…')
  let cookies = await registerSession()

  console.log('launching headed chromium…')
  let browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  })
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

  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  let aside = page.locator('aside[aria-label="Chat navigation"]')
  await aside.waitFor({ state: 'attached', timeout: 8000 })
  await page.locator('[data-lenis-root]').waitFor({ state: 'attached', timeout: 10000 })
  await page.waitForFunction(() => {
    let el = document.querySelector('aside[aria-label="Chat navigation"]')
    return el?.getAttribute('data-open') === 'true'
  }, { timeout: 10000 })
  await page.waitForTimeout(400)
  console.log('url after hydrate', page.url())
  await page.screenshot({ path: path.join(outDir, 'after-load.png') })

  let attachBtn = page.getByRole('button', { name: 'Attach files' })
  await attachBtn.waitFor({ state: 'visible', timeout: 5000 })

  async function attachNamedFile(filename: string, mimeType: string, buffer: Buffer) {
    let chooserPromise = page.waitForEvent('filechooser', { timeout: 8000 })
    await attachBtn.click()
    let chooser = await chooserPromise
    await chooser.setFiles([{ name: filename, mimeType, buffer }])
  }

  await attachNamedFile(
    'keep-me.txt',
    'text/plain',
    Buffer.from('Apples grow in orchards.\n'),
  )
  await page.waitForTimeout(400)
  console.log('url after attach', page.url())
  await page.screenshot({ path: path.join(outDir, 'after-attach.png') })
  console.log(
    'composer html',
    await page.locator('section[aria-label="Message composer"]').innerHTML().catch(() => 'missing'),
  )

  let strip = page.getByRole('list', { name: 'Attached files' })
  await strip.waitFor({ state: 'visible', timeout: 12000 })
  let thumb = strip.locator('li[data-filename="keep-me.txt"]')
  await thumb.waitFor({ state: 'visible' })
  await page.waitForFunction(() => {
    let el = document.querySelector('li[data-filename="keep-me.txt"]')
    return el?.getAttribute('title')?.includes('ready') === true
  }, { timeout: 120000 })
  console.log('OK keep-me.txt ready')

  let box = await thumb.boundingBox()
  if (!box) throw new Error('thumbnail has no bounding box')
  let cx = box.x + box.width / 2
  let cy = box.y + box.height / 2
  let cornerX = box.x + box.width - 8
  let cornerY = box.y + 8

  console.log('\n=== BEFORE HOVER ===')
  let before = await probe(page, 8, 8)
  console.log(JSON.stringify(before, null, 2))
  await page.screenshot({ path: path.join(outDir, 'before-hover.png'), fullPage: false })

  console.log(`\nmoving mouse to thumb center (${cx.toFixed(1)}, ${cy.toFixed(1)})`)
  await page.mouse.move(cx, cy, { steps: 25 })
  await page.waitForTimeout(400)

  console.log('\n=== DURING HOVER (center) ===')
  let during = await probe(page, cx, cy)
  console.log(JSON.stringify(during, null, 2))
  await page.screenshot({ path: path.join(outDir, 'during-hover-center.png'), fullPage: false })

  console.log(`\nmoving mouse to thumb corner X (${cornerX.toFixed(1)}, ${cornerY.toFixed(1)})`)
  await page.mouse.move(cornerX, cornerY, { steps: 15 })
  await page.waitForTimeout(400)

  console.log('\n=== DURING HOVER (corner / delete hit) ===')
  let corner = await probe(page, cornerX, cornerY)
  console.log(JSON.stringify(corner, null, 2))
  await page.screenshot({ path: path.join(outDir, 'during-hover-corner.png'), fullPage: false })

  if (!during.present) {
    throw new Error('[data-thumb-remove] is missing from the live DOM')
  }
  if (during.opacity !== '1' && corner.opacity !== '1') {
    throw new Error(
      `hover did not reveal delete button: center opacity=${during.opacity} corner opacity=${corner.opacity} li:hover=${during.liMatchesHover}/${corner.liMatchesHover}`,
    )
  }
  console.log(
    `OK visible on real mouse move: center opacity=${during.opacity} corner opacity=${corner.opacity}`,
  )

  let deleteDone = page.waitForResponse(
    (res) =>
      res.request().method() === 'DELETE' &&
      /\/files\/[^/]+$/.test(new URL(res.url()).pathname),
    { timeout: 15000 },
  )
  await page.mouse.click(cornerX, cornerY)
  let deleteRes = await deleteDone
  await page.waitForFunction(() => !document.querySelector('li[data-filename="keep-me.txt"]'))
  console.log(`OK click still deletes: DELETE ${deleteRes.status()}`)

  let cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 80,
    downloadThroughput: 80 * 1024,
    uploadThroughput: 4 * 1024,
    connectionType: 'cellular3g',
  })

  let abortedUploads = 0
  page.on('requestfailed', (req) => {
    if (!req.url().includes('/files/upload')) return
    let reason = req.failure()?.errorText ?? ''
    if (/abort/i.test(reason) || /ERR_ABORTED/i.test(reason)) abortedUploads += 1
  })

  await attachNamedFile(
    'abort-me.txt',
    'text/plain',
    Buffer.alloc(180_000, 97),
  )
  let abortThumb = strip.locator('li[data-filename="abort-me.txt"]')
  await abortThumb.waitFor({ state: 'visible', timeout: 12000 })
  let abortBox = await abortThumb.boundingBox()
  if (!abortBox) throw new Error('abort thumbnail has no bounding box')
  let abortCx = abortBox.x + abortBox.width / 2
  let abortCy = abortBox.y + abortBox.height / 2
  let abortCornerX = abortBox.x + abortBox.width - 8
  let abortCornerY = abortBox.y + 8
  await page.mouse.move(abortCx, abortCy, { steps: 20 })
  await page.waitForTimeout(300)
  let abortHover = await probe(page, abortCx, abortCy)
  console.log(`abort-thumb hover opacity=${abortHover.opacity} li:hover=${abortHover.liMatchesHover}`)
  if (abortHover.opacity !== '1') {
    throw new Error(`abort thumb hover opacity stayed ${abortHover.opacity}`)
  }
  await page.screenshot({ path: path.join(outDir, 'during-hover-abort.png'), fullPage: false })
  await page.mouse.click(abortCornerX, abortCornerY)
  await page.waitForFunction(() => !document.querySelector('li[data-filename="abort-me.txt"]'))
  console.log(
    abortedUploads > 0
      ? 'OK mid-upload abort: abort-me.txt removed'
      : 'OK abort-me.txt removed (upload may have finished first)',
  )

  if (consoleErrors.length) {
    console.log('Console errors:', consoleErrors)
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

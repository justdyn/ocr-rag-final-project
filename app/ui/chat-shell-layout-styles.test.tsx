/**
 * CSS-contract tests for the viewport-bound chat shell (scroll-ownership fix).
 *
 * Runs on node:test + the @remix-run/ui/test render harness under linkedom.
 * linkedom has no CSSOM, so a minimal CSSStyleSheet facade is installed and
 * `css()` mixin rules are asserted from `document.adoptedStyleSheets` — the
 * layout contract (100dvh shell, document never scrolls, inner scrollers own
 * overflow) is checked against the actual emitted rules, not class names.
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
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
  // Event/CustomEvent/EventTarget stay as node's globals: the remix runtime
  // dispatches `new Event(...)` on node EventTargets, and linkedom events fail
  // its brand check. linkedom uses its own event classes internally either way.
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

// --- dynamic imports after the shim -----------------------------------------
let { render } = await import('@remix-run/ui/test')
let { shellStyle } = await import('./styles/chat-shell/shell-styles.ts')
let {
  chatScrollRegionStyle,
  chatThreadStyle,
  composerDockStyle,
  mainContentWideStyle,
  mainHeaderStyle,
  mainStyle,
  modelListStyle,
  scrollFabStyle,
} = await import('./styles/chat-shell/main-styles.ts')
let { sidebarConversationsStyle, sidebarStyle } = await import(
  './styles/chat-shell/sidebar-styles.ts'
)

function ruleFor(el: Element | null): string {
  assert.ok(el, 'element exists')
  let sheets = (dom.document as unknown as {
    adoptedStyleSheets: { cssRules: { cssText: string }[] }[]
  }).adoptedStyleSheets
  let rule = sheets
    .flatMap((sheet) => sheet.cssRules.map((r) => r.cssText))
    .find((text) => text.includes(el.className))
  assert.ok(rule !== undefined, `css() rule found for .${el.className}`)
  return rule
}

/** All rules for one element's class, joined — empty-mode rules may be emitted
 * as a nested block or a sibling rule; assertions must hold either way. */
function joinedRuleText(el: Element): string {
  let sheets = (dom.document as unknown as {
    adoptedStyleSheets: { cssRules: { cssText: string }[] }[]
  }).adoptedStyleSheets
  return sheets
    .flatMap((sheet) => sheet.cssRules.map((r) => r.cssText))
    .filter((t) => t.includes(el.className))
    .join('\n')
}

describe('chat shell — viewport-bound layout contract', () => {
  it('shell pins to the dynamic viewport and clips overflow', () => {
    let view = render(<div mix={shellStyle} />)
    let rule = ruleFor(view.$('div'))
    assert.match(rule, /height:\s*100dvh/, `shell has a definite viewport height, got: ${rule}`)
    assert.match(rule, /overflow:\s*hidden/, `shell clips overflow, got: ${rule}`)
    assert.doesNotMatch(rule, /min-height:\s*100vh/, 'shell must not grow past the viewport')
    assert.doesNotMatch(rule, /--home-sidebar/, `dead --home-sidebar var removed, got: ${rule}`)
    view.cleanup()
  })

  it('main column no longer forces document growth', () => {
    let view = render(<div mix={mainStyle} />)
    let rule = ruleFor(view.$('div'))
    assert.doesNotMatch(rule, /min-height:\s*100vh/, `main stretches to the shell, got: ${rule}`)
    assert.match(rule, /overflow:\s*hidden/, `main keeps its clip, got: ${rule}`)
    view.cleanup()
  })

  it('full-bleed chat region is the inner scroller (scrollbar at panel edge)', () => {
    let view = render(<div mix={chatScrollRegionStyle} />)
    let rule = ruleFor(view.$('div'))
    assert.match(rule, /overflow-y:\s*auto/, `region owns vertical scroll, got: ${rule}`)
    assert.match(rule, /min-height:\s*0/, `region may shrink below content, got: ${rule}`)
    assert.match(rule, /width:\s*100%/, `region spans the main panel, got: ${rule}`)
    assert.match(
      rule,
      /padding-top:\s*52px/,
      `region clears the overlay chips at rest, got: ${rule}`,
    )
    view.cleanup()
  })

  it('glass header overlays content as a transparent bar (shared shell)', () => {
    let view = render(<header mix={mainHeaderStyle} data-glass="true" />)
    let header = view.$('header')
    assert.ok(header, 'header element exists')
    let text = joinedRuleText(header)
    let glassAt = text.indexOf('[data-glass="true"]')
    assert.ok(
      glassAt !== -1,
      `overlay rules must be gated behind [data-glass="true"], got: ${text}`,
    )
    let base = text.slice(0, glassAt)
    assert.match(
      base,
      /background:\s*var\(--home-bg\)/,
      `library header stays in-flow opaque, got: ${base}`,
    )
    let glass = text.slice(glassAt)
    assert.match(
      glass,
      /data-glass="true"\][\s\S]*?position:\s*absolute/,
      `glass header leaves document flow over the scroller, got: ${glass}`,
    )
    assert.match(
      glass,
      /data-glass="true"\][\s\S]*?top:\s*0/,
      `glass header pins to the panel top, got: ${glass}`,
    )
    assert.match(
      glass,
      /data-glass="true"\][\s\S]*?left:\s*0[\s\S]*?right:\s*0/,
      `glass header spans the panel, got: ${glass}`,
    )
    assert.match(
      glass,
      /data-glass="true"\][\s\S]*?background:\s*transparent/,
      `glass header bar is transparent so thread text shows through, got: ${glass}`,
    )
    assert.doesNotMatch(
      glass,
      /backdrop-filter/,
      `header bar never samples the moving thread (CV-6 spirit), got: ${glass}`,
    )
    view.cleanup()
  })

  it('empty stage clusters hero + composer dock; in-thread region still grows', () => {
    // Region: in-thread grows; empty stops growing with a TOP auto-margin only —
    // margin-bottom:auto here would push the dock away and reopen the gap.
    let regionView = render(<div mix={chatScrollRegionStyle} />)
    let region = regionView.$('div')
    assert.ok(region, 'region element exists')
    let regionText = joinedRuleText(region)
    assert.match(
      regionText,
      /flex:\s*1 1 auto/,
      `in-thread: region grows, dock stays bottom, got: ${regionText}`,
    )
    assert.match(
      regionText,
      /data-empty="true"[\s\S]*?flex:\s*0 1 auto/,
      `empty: region stops growing so hero hugs the dock, got: ${regionText}`,
    )
    assert.match(
      regionText,
      /data-empty="true"[\s\S]*?margin-top:\s*auto/,
      `empty: region auto-margin opens space above the hero, got: ${regionText}`,
    )
    assert.doesNotMatch(
      regionText,
      /data-empty="true"[\s\S]*?margin-bottom:\s*auto/,
      `empty: region must NOT claim margin-bottom:auto (dock owns it), got: ${regionText}`,
    )
    regionView.cleanup()

    // Dock: empty carries the paired bottom auto-margin; base stays margin-free.
    let dockView = render(<div mix={composerDockStyle} />)
    let dock = dockView.$('div')
    assert.ok(dock, 'dock element exists')
    let dockText = joinedRuleText(dock)
    assert.match(
      dockText,
      /data-empty="true"[\s\S]*?margin-bottom:\s*auto/,
      `empty: dock auto-margin centers the hero+dock cluster, got: ${dockText}`,
    )
    assert.match(
      dockText,
      /data-empty="false"[\s\S]*?position:\s*absolute/,
      `in-thread: dock overlays scroller for glass, got: ${dockText}`,
    )
    let dockBase = dockText.split('[data-empty')[0]
    assert.doesNotMatch(
      dockBase,
      /margin-bottom/,
      `base dock has no auto margin, got: ${dockBase}`,
    )
    assert.match(
      dockBase,
      /(padding:\s*0(px)?\s+0(px)?\s+20px|padding-bottom:\s*20px)/,
      `base dock keeps a 20px bottom inset so the composer is not cramped, got: ${dockBase}`,
    )
    dockView.cleanup()
  })

  it('in-thread scroll region reserves bottom padding for the absolute dock', () => {
    let regionView = render(<div mix={chatScrollRegionStyle} />)
    let region = regionView.$('div')
    assert.ok(region, 'region element exists')
    let regionText = joinedRuleText(region)
    assert.match(
      regionText,
      /data-empty="false"[\s\S]*?padding-bottom:\s*162px/,
      `in-thread: padding clears the footer-less dock stack, got: ${regionText}`,
    )
    regionView.cleanup()
  })

  it('scroll fab visibility is CSS-driven — data-visible makes it opaque and clickable', () => {
    let view = render(<button mix={scrollFabStyle} />)
    let fab = view.$('button')
    assert.ok(fab, 'fab element exists')
    let text = joinedRuleText(fab)
    assert.match(
      text,
      /data-visible="true"[\s\S]*?opacity:\s*1/,
      `CSS must show the fab even when Framer inline styles are gone, got: ${text}`,
    )
    assert.match(
      text,
      /data-visible="true"[\s\S]*?pointer-events:\s*auto/,
      `CSS must keep the fab clickable even when Framer inline styles are gone, got: ${text}`,
    )
    view.cleanup()
  })

  it('in-thread dock underlay is fully opaque at the pill top (glass isolation)', () => {
    let dockView = render(<div mix={composerDockStyle} />)
    let dock = dockView.$('div')
    assert.ok(dock, 'dock element exists')
    let dockText = joinedRuleText(dock)
    assert.match(
      dockText,
      /data-empty="false"[\s\S]*?rgba\(255,\s*255,\s*255,\s*1\)\s*72px/,
      `gradient must reach full opacity at the 72px pill top so blur never samples the scroller, got: ${dockText}`,
    )
    dockView.cleanup()
  })

  it('composer pill is stable frost — never samples the moving thread', async () => {
    let { composerPillStyle } = await import('./styles/chat-shell/composer-styles.ts')
    let view = render(<div mix={composerPillStyle} />)
    let pill = view.$('div')
    assert.ok(pill, 'pill element exists')
    let text = joinedRuleText(pill)
    assert.doesNotMatch(
      text,
      /backdrop-filter/,
      `pill must not backdrop-sample the scroller (CV-6 stable frost), got: ${text}`,
    )
    assert.match(
      text,
      /background:\s*rgba\(255,\s*255,\s*255,\s*0\.96\)/,
      `pill fill is near-opaque stable frost, got: ${text}`,
    )
    view.cleanup()
  })

  it('chat glass chrome — solid page-color chips, no border/shadow, hover pinned, flat base hover intact', async () => {
    let { headerSidebarOpenStyle, modelSelectorStyle } = await import(
      './styles/chat-shell/main-styles.ts'
    )
    for (let style of [headerSidebarOpenStyle, modelSelectorStyle]) {
      let view = render(<button mix={style} data-glass="true" />)
      let chip = view.$('button')
      assert.ok(chip, 'chip element exists')
      let text = joinedRuleText(chip)
      let glassAt = text.indexOf('data-glass="true"]')
      assert.ok(
        glassAt !== -1,
        `glass rules must be gated behind [data-glass="true"], got: ${text}`,
      )
      let base = text.slice(0, glassAt)
      assert.match(
        base,
        /&:hover[\s\S]*?background:\s*var\(--home-surface\)/,
        `non-glass (library) flat hover preserved, got: ${base}`,
      )
      let glass = text.slice(glassAt)
      assert.match(
        glass,
        /data-glass="true"\][\s\S]{0,120}?background:\s*var\(--home-bg\)/,
        `idle chip is opaque page color (--home-bg), got: ${glass}`,
      )
      assert.match(
        glass,
        /:hover[\s\S]{0,120}?background:\s*var\(--home-bg\)/,
        `glass hover stays pinned to page color (no surface flip), got: ${glass}`,
      )
      assert.match(
        glass,
        /:focus-visible[\s\S]{0,120}?background:\s*var\(--home-bg\)/,
        `glass focus stays pinned to page color, got: ${glass}`,
      )
      assert.doesNotMatch(
        glass,
        /rgba\(255,\s*255,\s*255,\s*0\.72\)|0 0 0 1px|inset 0 1px/,
        `no frost fill, hairline ring, or inset highlight on chips, got: ${glass}`,
      )
      assert.doesNotMatch(
        glass,
        /box-shadow:(?!\s*none)/,
        `chips carry no box-shadow beyond the explicit none, got: ${glass}`,
      )
      assert.doesNotMatch(
        glass,
        /prefers-reduced-transparency/,
        `solid page-color chips need no reduced-transparency fallback (YAGNI), got: ${glass}`,
      )
      assert.doesNotMatch(
        glass,
        /translateY\(-1px\)|rgba\(255,\s*255,\s*255,\s*0\.92\)/,
        `no hover lift, no hover-strengthened frost, got: ${glass}`,
      )
      assert.doesNotMatch(
        glass,
        /backdrop-filter/,
        `header chips are solid — never sample the thread (CV-6 spirit), got: ${glass}`,
      )
      view.cleanup()
    }
    let sidebarView = render(<button mix={headerSidebarOpenStyle} data-glass="true" />)
    let sidebarChip = sidebarView.$('button')
    assert.ok(sidebarChip, 'sidebar chip element exists')
    let sidebarText = joinedRuleText(sidebarChip)
    assert.match(
      sidebarText,
      /&:active\s*{\s*transform:\s*scale\(0\.96\)/,
      'sidebar-open chip keeps its flat-base press scale',
    )
    sidebarView.cleanup()
  })

  it('empty-stage and thread hide styles only toggle display (always mounted)', async () => {
    let { emptyStageHiddenStyle, chatThreadHiddenStyle } = await import(
      './styles/chat-shell/main-styles.ts'
    )
    let hiddenStage = render(<div mix={emptyStageHiddenStyle} />)
    let stageRule = ruleFor(hiddenStage.$('div'))
    assert.match(stageRule, /display:\s*none/, `empty stage hide is display:none, got: ${stageRule}`)
    hiddenStage.cleanup()

    let hiddenThread = render(<ul mix={chatThreadHiddenStyle} />)
    let threadRule = ruleFor(hiddenThread.$('ul'))
    assert.match(threadRule, /display:\s*none/, `thread hide is display:none, got: ${threadRule}`)
    hiddenThread.cleanup()
  })

  it('thread list grows with content and does not own overflow', () => {
    let view = render(<ul mix={chatThreadStyle} />)
    let rule = ruleFor(view.$('ul'))
    assert.doesNotMatch(rule, /overflow-y:\s*auto/, `thread must not own scroll, got: ${rule}`)
    view.cleanup()
  })

  it('DocIntel wide content column is its own full-bleed scroller', () => {
    let view = render(<main mix={mainContentWideStyle} />)
    let rule = ruleFor(view.$('main'))
    assert.match(rule, /overflow-y:\s*auto/, `wide content owns vertical scroll, got: ${rule}`)
    assert.match(rule, /min-height:\s*0/, `wide content may shrink below content, got: ${rule}`)
    assert.match(
      rule,
      /padding(?:-top)?:\s*52px/,
      `wide content clears absolute glass header (52px top), got: ${rule}`,
    )
    assert.doesNotMatch(
      rule,
      /max-width:\s*960px/,
      `max-width lives on the inner panel so the scrollbar stays edge-aligned, got: ${rule}`,
    )
    view.cleanup()
  })

  it('sidebar aside is viewport-tall, not document-tall', () => {
    let view = render(<aside mix={sidebarStyle} />)
    let rule = ruleFor(view.$('aside'))
    assert.match(rule, /height:\s*100%/, `aside fills its track, got: ${rule}`)
    assert.doesNotMatch(rule, /min-height:\s*100vh/, 'aside must not force document growth')
    view.cleanup()
  })

  it('sidebar conversations nav scrolls internally', () => {
    let view = render(<nav mix={sidebarConversationsStyle} />)
    let rule = ruleFor(view.$('nav'))
    assert.match(rule, /overflow-y:\s*auto/, `conversation list owns vertical scroll, got: ${rule}`)
    assert.match(rule, /min-height:\s*0/, `conversation list may shrink below content, got: ${rule}`)
    view.cleanup()
  })

  it('model picker open lifts header above dock and hides the composer dock', () => {
    let mainView = render(<div mix={mainStyle} data-model-picker-open="true" />)
    let main = mainView.$('div')
    assert.ok(main, 'main element exists')
    let mainText = joinedRuleText(main)
    assert.match(
      mainText,
      /data-model-picker-open="true"[\s\S]*?>\s*header[\s\S]*?z-index:\s*5/,
      `picker open raises header above dock (z 3), got: ${mainText}`,
    )
    assert.match(
      mainText,
      /data-model-picker-open="true"[\s\S]*?data-composer-dock[\s\S]*?visibility:\s*hidden/,
      `picker open hides dock without unmounting, got: ${mainText}`,
    )
    assert.match(
      mainText,
      /data-model-picker-open="true"[\s\S]*?data-composer-dock[\s\S]*?pointer-events:\s*none/,
      `picker open makes dock non-interactive, got: ${mainText}`,
    )
    mainView.cleanup()

    let listView = render(<div mix={modelListStyle} />)
    let listRule = ruleFor(listView.$('div'))
    assert.match(
      listRule,
      /max-height:\s*min\(280px,\s*calc\(100dvh/,
      `model list clamps to viewport under the header, got: ${listRule}`,
    )
    listView.cleanup()
  })
})

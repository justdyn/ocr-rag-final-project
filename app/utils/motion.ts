/**
 * Shared motion presets (styleguide §5.2).
 * Remix 3 is not React — use framer-motion/dom `animate()` + remix/ui/animation mixins,
 * not React `motion.*` components (those need a React runtime).
 */
import { animate } from 'framer-motion/dom'
import { animateEntrance, spring } from 'remix/ui/animation'

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

/** Gentle list/card entrance mixin for Remix hosts (§5.2 entranceSoft, §5.4 reduced). */
export function entranceSoft() {
  if (prefersReducedMotion()) {
    return animateEntrance({ opacity: 0, duration: 150 })
  }
  return animateEntrance({
    opacity: 0,
    transform: 'translateY(8px)',
    ...spring('smooth'),
  })
}

/** Fast streaming entrance — first real use: chat message bubbles (Phase 7 Step 4). */
export function entranceFast() {
  if (prefersReducedMotion()) {
    return animateEntrance({ opacity: 0, duration: 80 })
  }
  return animateEntrance({
    opacity: 0,
    transform: 'translateY(4px)',
    duration: 120,
  })
}

/** Short press scale via framer-motion/dom. */
export function animatePress(el: Element): void {
  if (prefersReducedMotion()) return
  animate(el, { scale: [1, 0.98, 1] }, { duration: 0.1 })
}

/**
 * Dropzone drag-over feedback (§5.1 file upload).
 * opacity-only when prefers-reduced-motion.
 */
export function animateDropzone(el: Element, active: boolean): void {
  if (prefersReducedMotion()) {
    animate(el, { opacity: active ? 1 : 0.92 }, { duration: 0.12 })
    return
  }
  animate(
    el,
    { scale: active ? 1.01 : 1 },
    { type: 'spring', stiffness: 420, damping: 28 },
  )
}

/**
 * Accordion-style panel open/close via framer-motion/dom (§5.2 expandCollapse).
 * First real use: knowledge detail “Add file” panel. Opacity-only when reduced motion (§5.4).
 */
export function animateExpandCollapse(el: HTMLElement, open: boolean): void {
  if (prefersReducedMotion()) {
    el.hidden = !open
    el.style.height = ''
    el.style.overflow = ''
    el.style.opacity = open ? '1' : '0'
    return
  }

  if (open) {
    el.hidden = false
    el.style.overflow = 'hidden'
    el.style.height = '0px'
    el.style.opacity = '0'
    let target = el.scrollHeight
    animate(
      el,
      { height: [0, target], opacity: [0, 1] },
      { type: 'spring', stiffness: 380, damping: 32 },
    ).then(() => {
      el.style.height = 'auto'
      el.style.overflow = ''
    })
    return
  }

  let from = el.scrollHeight
  el.style.overflow = 'hidden'
  el.style.height = `${from}px`
  animate(
    el,
    { height: [from, 0], opacity: [1, 0] },
    { type: 'spring', stiffness: 420, damping: 36 },
  ).then(() => {
    el.hidden = true
    el.style.height = ''
    el.style.overflow = ''
  })
}

/** Absolute dropdown/popover fade (account menu) — height expandCollapse is for in-flow panels. */
export function animateMenuFade(el: HTMLElement, open: boolean): void {
  if (prefersReducedMotion()) {
    el.hidden = !open
    el.style.opacity = open ? '1' : '0'
    return
  }
  if (open) {
    el.hidden = false
    el.style.opacity = '0'
    animate(el, { opacity: 1 }, { duration: 0.15 })
    return
  }
  animate(el, { opacity: 0 }, { duration: 0.12 }).then(() => {
    el.hidden = true
  })
}

/** @deprecated Prefer animateExpandCollapse — kept as the §5.2 preset name alias. */
export function expandCollapse(el: HTMLElement, open: boolean): void {
  animateExpandCollapse(el, open)
}

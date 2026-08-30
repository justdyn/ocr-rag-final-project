import Lenis from 'lenis'

export const LENIS_OPTIONS = {
  duration: 1.1,
  easing: (t: number) => Math.min(1, 1.001 - 2 ** (-10 * t)),
  lerp: 0.09,
  smoothWheel: true,
  autoRaf: true,
  touchMultiplier: 1.15,
} as const

/** Single active instance for the document root (styleguide §4.1). */
let activeLenis: Lenis | null = null

export function createLenisInstance(): Lenis {
  let prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  let lenis = prefersReducedMotion
    ? new Lenis({ smoothWheel: false, autoRaf: true })
    : new Lenis(LENIS_OPTIONS)

  activeLenis = lenis
  return lenis
}

export function destroyLenisInstance(instance: Lenis): void {
  instance.destroy()
  if (activeLenis === instance) {
    activeLenis = null
  }
}

/** Route-transition scroll reset (styleguide §4.2). */
export function resetLenisScroll(): void {
  activeLenis?.scrollTo(0, { immediate: true })
}

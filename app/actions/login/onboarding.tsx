/**
 * Login onboarding splash — Remix port of Open WebUI OnBoarding.svelte (v0.6.18, SlideShow+Marquee era).
 * Route-local under actions/login (styleguide §2.1). Visual copy: ten marquee lines,
 * "wherever you are", Get started; photos served from /images (public/images).
 *
 * Remix 3 notes: this is the ONE clientEntry (nested clientEntry does not hydrate), so it also owns
 * the shared 5s clock that rotates both SlideShow and Marquee. Splash and the Sign in form beneath
 * are always mounted — hiding is data-show + CSS (opacity/visibility/pointer-events), never unmount.
 */
import { clientEntry, css, on, type Handle } from 'remix/ui'

import { ArrowRightCircle } from './arrow-right-circle.tsx'
import { Marquee } from './marquee.tsx'
import { nextSlideIndex, SlideShow, SLIDE_SHOW_IMAGES } from './slide-show.tsx'

const SLIDE_DURATION_MS = 5000

// Hide + reveal in one css() mixin so Remix's @layer rmx.hash cannot split them
// (Tailwind data-[show=false] never made it into public/tailwind.css).
const splashFrameStyle = css({
  position: 'fixed',
  inset: 0,
  zIndex: 50,
  color: '#fff',
  transitionProperty: 'opacity, visibility',
  transitionDuration: '300ms',
  transitionTimingFunction: 'cubic-bezier(0.22, 1, 0.36, 1)',
  '&[data-show="false"]': {
    pointerEvents: 'none',
    visibility: 'hidden',
    opacity: 0,
  },
  '@media (prefers-reduced-motion: reduce)': {
    transitionDuration: '0ms',
  },
})

export const Onboarding = clientEntry(
  import.meta.url,
  function Onboarding(handle: Handle<{ show?: boolean }>) {
    // Setup scope — runs once per instance; state here drives every re-render.
    // Direct /login (register Sign in) starts hidden; anonymous `/` passes show=true.
    let showSplash = handle.props.show === true
    let index = 0

    handle.queueTask(() => {
      // prefers-reduced-motion: keep the splash static (no interval rotation).
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return

      let timer = setInterval(() => {
        index = nextSlideIndex(index, SLIDE_SHOW_IMAGES.length)
        handle.update()
      }, SLIDE_DURATION_MS)
      // queueTask's own signal aborts on re-render; the shared clock must survive
      // every handle.update(), so cleanup binds to the component lifecycle instead.
      handle.signal.addEventListener('abort', () => clearInterval(timer))
    })

    return () => (
      <div
        data-show={showSplash ? 'true' : 'false'}
        mix={splashFrameStyle}
      >
        /* Tensho favicon instead of the OWUI logo (no favicon-dark asset in this repo). */
        <img
          src="/favicon.svg"
          alt="Tensho logo"
          className="absolute left-10 top-10 z-20 size-6 rounded-full"
        />

        <SlideShow index={index} />

        {/* OWUI layering: bottom-up dark gradient, then a translucent blur wash. */}
        <div className="absolute inset-0 bg-linear-to-t from-20% from-black to-transparent" />
        <div className="absolute inset-0 bg-black/50 backdrop-blur-xs" />

        <div className="relative z-10 flex min-h-full w-full flex-col items-center justify-end pb-10 text-center">
          <div className="font-display">
            <Marquee index={index} />
            <div className="mt-1 text-3xl leading-snug lg:text-5xl">wherever you are</div>
          </div>

          <div className="mt-8 flex flex-col items-center justify-center">
            <button
              type="button"
              aria-label="Get started"
              mix={on('click', () => {
                // OWUI getStartedHandler minus the signup/ldap switch — /register keeps its own link.
                showSplash = false
                handle.update()
              })}
              className="rounded-full bg-white/5 p-1 transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/50"
            >
              <ArrowRightCircle className="size-6" />
            </button>
            <div className="mt-1.5 text-base font-medium">Get started</div>
          </div>
        </div>
      </div>
    )
  },
)

/**
 * Full-screen fading photo backdrop for the login onboarding splash (route-local, styleguide §2.1).
 * Ported from Open WebUI SlideShow.svelte: one cover-fit layer per image, 1s opacity crossfade.
 * The rotation timer lives in Onboarding — this component is render-only (one clientEntry owns timers).
 */
import type { Handle } from 'remix/ui'

/** DocIntel serves the OWUI onboarding photos from /images (public/images). */
export const SLIDE_SHOW_IMAGES = [
  '/images/adam.jpg',
  '/images/galaxy.jpg',
  '/images/earth.jpg',
  '/images/space.jpg',
]

/** Fix for the OWUI off-by-one (`% (length - 1)` skipped the last photo). */
export function nextSlideIndex(current: number, total: number): number {
  return (current + 1) % total
}

export function SlideShow(handle: Handle<{ images?: string[]; index: number }>) {
  return () => {
    let images = handle.props.images ?? SLIDE_SHOW_IMAGES
    let index = handle.props.index % images.length

    return (
      <div className="absolute inset-0 overflow-hidden" aria-hidden="true">
        {images.map((src, i) => (
          <div
            key={src}
            className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000 ease-in-out"
            style={`background-image: url('${src}'); opacity: ${i === index ? 1 : 0};`}
          />
        ))}
      </div>
    )
  }
}

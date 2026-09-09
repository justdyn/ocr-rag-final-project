/**
 * One-word-at-a-time vertical marquee for the onboarding splash (route-local, styleguide §2.1).
 * Ported from Open WebUI Marquee.svelte (fly-up entrance per word). Render-only: the shared
 * onboarding clock passes `index`, so the single clientEntry timer drives slides and words alike.
 */
import { css, type Handle } from 'remix/ui'

/** The ten OWUI onboarding lines, verbatim. */
export const MARQUEE_WORDS = [
  'Explore the cosmos',
  'Unlock mysteries',
  'Chart new frontiers',
  'Dive into knowledge',
  'Discover wonders',
  'Ignite curiosity',
  'Forge new paths',
  'Unravel secrets',
  'Pioneer insights',
  'Embark on adventures',
]

/** Fly-up entrance replayed on word change (key remount restarts the animation). */
const marqueeItemStyle = css({
  animation: 'onboarding-marquee-fly 1s ease-out both',
  '@keyframes onboarding-marquee-fly': {
    from: { opacity: '0', transform: 'translateY(30%)' },
    to: { opacity: '1', transform: 'translateY(0)' },
  },
})

export function Marquee(handle: Handle<{ words?: string[]; index: number }>) {
  return () => {
    let words = handle.props.words ?? MARQUEE_WORDS
    let index = handle.props.index % words.length

    return (
      <div className="overflow-hidden py-2 text-5xl leading-[1.2] lg:text-7xl">
        {/* key on the word index remounts the node so the fly-up replays each change. */}
        <div key={index} mix={marqueeItemStyle}>
          {words[index]}
        </div>
      </div>
    )
  }
}

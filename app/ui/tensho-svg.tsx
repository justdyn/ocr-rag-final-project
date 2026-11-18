/**
 * Animated Tensho wordmark.
 *
 * Effect: letters dash in from the left (F1-style, skewed + fast), flash pure white
 * with a glow, then settle back to the real colour while a glossy white streak
 * sweeps across the whole word. Total runtime is under a second.
 *
 * - Pure CSS keyframes inside the SVG: no JS, no hydration, works in SSR.
 * - Final colour is `currentColor`, so set it with Tailwind (e.g. `text-foreground`).
 * - Waits for the login onboarding splash: while <html data-splash="open"> the letters are
 *   hidden, and the intro plays when it becomes "closed" (or immediately if no splash exists).
 * - Optionally respects `prefers-reduced-motion` (see `respectReducedMotion`).
 * - Uses a fixed clipPath id, so render only one instance per page.
 */
import type { Handle } from 'remix/component'

export type TenshoSvgProps = {
  className?: string
  /** Set false to render the static logo. */
  animated?: boolean
  /** When true, skip the animation for users with "reduce motion" enabled in their OS. */
  respectReducedMotion?: boolean
}

/** One path per letter: T E N S H O (the "O" includes its inner counter). */
const LETTER_PATHS = [
  // T
  'M22.4796 33.6169L27.1501 11.6438H4.8301L7.14541 0.751098H66.6654L64.3501 11.6438H42.0301L37.3596 33.6169H22.4796Z',
  // E
  'M55.0011 33.6169L61.9869 0.751098H121.507L119.491 10.2352H74.851L74.2322 13.1462H113.688L111.972 21.2218H72.5157L71.897 24.1327H116.537L114.521 33.6169H55.0011Z',
  // N
  'M111.013 33.6169L117.999 0.751098H132.687L158.787 18.8742L162.639 0.751098H177.519L170.533 33.6169H155.845L129.745 15.4937L125.893 33.6169H111.013Z',
  // S
  'M198.523 34.3681C194.619 34.3681 190.736 34.1177 186.874 33.6169C183.006 33.1473 179.347 32.5213 175.898 31.7388C172.454 30.925 169.425 30.0486 166.808 29.1096L172.899 21.4565C177.856 23.4285 182.703 24.7118 187.441 25.3065C192.217 25.8699 196.845 26.1516 201.325 26.1516C204.653 26.1516 207.192 26.0264 208.941 25.776C210.697 25.4943 211.638 25.0561 211.764 24.4614C211.877 23.9293 211.333 23.5537 210.132 23.3346C208.962 23.1155 207.341 22.9903 205.268 22.959C203.201 22.8964 200.894 22.8338 198.348 22.7712C195.833 22.7086 193.232 22.599 190.546 22.4425C187.891 22.286 185.343 22.0043 182.901 21.5974C180.466 21.1592 178.327 20.5332 176.484 19.7193C174.641 18.9055 173.255 17.8256 172.325 16.4797C171.427 15.1338 171.194 13.4435 171.627 11.409C172.079 9.28055 173.134 7.48075 174.79 6.00962C176.479 4.53849 178.601 3.36471 181.155 2.48829C183.709 1.61187 186.546 0.985854 189.666 0.610246C192.825 0.203337 196.084 -0.000118159 199.444 -0.000118159C202.452 -0.000118159 205.446 0.140735 208.426 0.422442C211.445 0.672846 214.344 1.0328 217.124 1.50232C219.911 1.94053 222.474 2.45699 224.811 3.0517C227.149 3.64642 229.128 4.27243 230.748 4.92975L224.657 12.5828C222.137 11.6438 219.295 10.8612 216.132 10.2352C213.008 9.5779 209.719 9.09274 206.266 8.77973C202.819 8.43543 199.367 8.26327 195.911 8.26327C190.567 8.26327 187.779 8.81104 187.546 9.90656C187.44 10.4074 187.987 10.7673 189.189 10.9864C190.39 11.2055 192.024 11.3464 194.091 11.409C196.196 11.4403 198.506 11.4872 201.021 11.5498C203.504 11.6124 206.072 11.722 208.727 11.8785C211.414 12.035 213.962 12.3167 216.371 12.7236C218.813 13.1305 220.955 13.7409 222.798 14.5547C224.68 15.3372 226.073 16.3858 226.977 17.7004C227.882 19.0151 228.125 20.6584 227.706 22.6303C227.247 24.7901 226.121 26.6211 224.33 28.1236C222.571 29.626 220.343 30.8467 217.648 31.7858C214.959 32.6935 211.971 33.3508 208.684 33.7577C205.398 34.1646 202.011 34.3681 198.523 34.3681Z',
  // H
  'M221.021 33.6169L228.007 0.751098H242.887L240.602 11.5029H270.362L272.647 0.751098H287.527L280.541 33.6169H265.661L268.146 21.926H238.386L235.901 33.6169H221.021Z',
  // O
  'M305.847 34.3681C299.767 34.3681 294.63 33.6951 290.436 32.3492C286.281 30.9719 283.257 29.0157 281.364 26.4803C279.503 23.9449 278.941 20.9401 279.68 17.4657L279.8 16.9023C280.545 13.3966 282.384 10.3917 285.316 7.88766C288.287 5.35231 292.139 3.41166 296.873 2.06573C301.646 0.688497 307.072 -0.000118159 313.152 -0.000118159C319.264 -0.000118159 324.398 0.688497 328.553 2.06573C332.715 3.41166 335.727 5.35231 337.588 7.88766C339.488 10.3917 340.065 13.3966 339.32 16.9023L339.2 17.4657C338.462 20.9401 336.607 23.9449 333.636 26.4803C330.697 29.0157 326.857 30.9719 322.116 32.3492C317.382 33.6951 311.959 34.3681 305.847 34.3681ZM308.143 23.5693C312.527 23.5693 316.096 23.0372 318.85 21.973C321.643 20.8775 323.242 19.375 323.648 17.4657L323.768 16.9023C324.174 14.9929 323.21 13.5061 320.876 12.4419C318.581 11.3464 315.241 10.7986 310.857 10.7986C306.505 10.7986 302.933 11.3464 300.14 12.4419C297.354 13.5061 295.758 14.9929 295.352 16.9023L295.232 17.4657C294.826 19.375 295.787 20.8775 298.114 21.973C300.448 23.0372 303.791 23.5693 308.143 23.5693Z',
]

const STAGGER_MS = 35
/** Roughly the onboarding splash fade-out, so the intro starts as it clears. */
const SPLASH_FADE_MS = 120

// No quotes, ">" or "&" in here so SSR escaping can't mangle it.
const BASE_CSS = `
.tensho-letter { fill: currentColor; transform-box: fill-box; transform-origin: 0% 100%; }
.tensho-ghost { fill: currentColor; opacity: 0; transform-box: fill-box; transform-origin: 0% 100%; }
.tensho-shine { opacity: 0; }

html[data-splash=open] [data-animated=true] .tensho-letter { opacity: 0; }

/* Launch: hard acceleration, snap to a stop. */
html:not([data-splash=open]) [data-animated=true] .tensho-letter {
  animation:
    tensho-launch 380ms cubic-bezier(0.05, 0.85, 0.1, 1) both,
    tensho-flash 520ms ease-out both;
  animation-delay: var(--d), var(--d);
}
/* Blurred trail that lags behind each letter. */
html:not([data-splash=open]) [data-animated=true] .tensho-ghost {
  animation: tensho-trail 460ms cubic-bezier(0.05, 0.85, 0.1, 1) both;
  animation-delay: calc(var(--d) + 40ms);
}
/* Pit-lane flyby: quick glossy pass right after the letters land. */
html:not([data-splash=open]) [data-animated=true] .tensho-shine {
  animation: tensho-sweep 480ms cubic-bezier(0.7, 0, 0.3, 1) 360ms both;
}

@keyframes tensho-launch {
  0%   { opacity: 0; transform: translateX(-160px) skewX(-38deg) scaleX(2.4); filter: blur(5px); }
  35%  { opacity: 1; }
  100% { opacity: 1; transform: translateX(0) skewX(0) scaleX(1); filter: blur(0); }
}
@keyframes tensho-trail {
  0%   { opacity: 0.55; transform: translateX(-230px) skewX(-38deg) scaleX(3); filter: blur(4px); }
  100% { opacity: 0; transform: translateX(0) skewX(0) scaleX(1); filter: blur(0); }
}
@keyframes tensho-flash {
  0%   { fill: #fff; filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
  25%  { fill: #fff; filter: drop-shadow(0 0 10px rgba(255,255,255,1)); }
  55%  { fill: #fff; filter: drop-shadow(0 0 5px rgba(255,255,255,0.8)); }
  100% { fill: currentColor; filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
}
@keyframes tensho-sweep {
  0%   { opacity: 1; transform: translateX(-140px) skewX(-30deg); }
  100% { opacity: 1; transform: translateX(500px) skewX(-30deg); }
}

@media (prefers-reduced-motion: reduce) {
  [data-respect-motion=true] .tensho-letter,
  [data-respect-motion=true] .tensho-ghost,
  [data-respect-motion=true] .tensho-shine { animation: none; }
  [data-respect-motion=true] .tensho-shine { display: none; }
}
`

const CSS =
  BASE_CSS +
  LETTER_PATHS.map(
    (_, i) =>
      `.tensho-letter:nth-child(${i + 1}), .tensho-ghost:nth-child(${i + 1}) { --d: ${SPLASH_FADE_MS + i * STAGGER_MS}ms; }`,
  ).join('\n')

export function TenshoSvg(handle: Handle<TenshoSvgProps>) {
  return () => {
    let { className, animated = true, respectReducedMotion = false } = handle.props

    return (
      <svg
        className={className}
        viewBox="0 0 343 35"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        role="img"
        aria-label="Tensho"
        data-animated={animated ? 'true' : 'false'}
        data-respect-motion={respectReducedMotion ? 'true' : 'false'}
      >
        <style>{CSS}</style>
        <defs>
          <clipPath id="tensho-clip">
            {LETTER_PATHS.map((d) => (
              <path d={d} />
            ))}
          </clipPath>
          <linearGradient id="tensho-gloss" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.95" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
        </defs>

        <g aria-hidden="true">
          {LETTER_PATHS.map((d) => (
            <path className="tensho-ghost" d={d} />
          ))}
        </g>

        <g>
          {LETTER_PATHS.map((d) => (
            <path className="tensho-letter" d={d} />
          ))}
        </g>

        <g clipPath="url(#tensho-clip)">
          <rect className="tensho-shine" x="0" y="-2" width="70" height="40" fill="url(#tensho-gloss)" />
        </g>
      </svg>
    )
  }
}
// THE motion system. Every animation on the site takes its easing and duration from here,
// in JS (GSAP) and in CSS (the same values are emitted as custom properties by Base.astro).
// Only `transform`, `opacity` and `clip-path` are ever animated.

/** GSAP ease names. */
export const EASE = {
  /** Arrivals: fast start, very long settle. Headline reveals, spreads coming in. */
  out: 'expo.out',
  /** Things that both leave and arrive: wipes, the slider's "show me" sweep. */
  inOut: 'power3.inOut',
  /** Scroll-linked (scrubbed) motion is always linear so it tracks the finger. */
  none: 'none',
} as const;

/** Durations in seconds. */
export const DUR = {
  fast: 0.4,
  base: 0.9,
  slow: 1.4,
} as const;

/** Stagger between lines / characters, in seconds. */
export const STAGGER = {
  lines: 0.09,
  chars: 0.018,
} as const;

/**
 * Scroll-linked (scrubbed) timelines catch up to the scrollbar over this many seconds.
 * A small lag reads as weight, and it means styles are written on the animation frame,
 * never inside the scroll event itself (which browsers warn about and cannot composite well).
 */
export const SCRUB = 0.35;

/** CSS equivalents of the GSAP eases above (same curves). */
const CSS_EASE = {
  out: 'cubic-bezier(0.16, 1, 0.3, 1)', // expo.out
  inOut: 'cubic-bezier(0.65, 0, 0.35, 1)', // power3.inOut
};

export const motionCss = `:root{--ease-out:${CSS_EASE.out};--ease-in-out:${CSS_EASE.inOut};--dur-fast:${DUR.fast}s;--dur-base:${DUR.base}s;--dur-slow:${DUR.slow}s}`;

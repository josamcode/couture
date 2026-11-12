// Shared, tiny state between the scroll timeline and the WebGL painting.
// `progress` is 0 (painting) → 1 (line-art). ScrollTrigger tweens it; the shader reads it.
// `zoom` is 0 → 1: how far we have travelled into the picture.
export const paintingState = { progress: 0, zoom: 0 };

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const onIdle = (cb: () => void, timeout = 1500) => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(cb, { timeout });
  else setTimeout(cb, 200);
};

/**
 * Scroll the page to a position. Lenis replaces `to` while it is running (desktop);
 * otherwise this is the browser's own smooth scrolling (off when reduced motion is on).
 */
export const scroller = {
  to(y: number) {
    window.scrollTo({ top: y, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  },
};

/** Let the browser breathe: resolve in a new task so input and paint can run in between. */
export const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** Run a piece of setup and record how long it took (visible in DevTools → Performance → Timings). */
export function timed<T>(name: string, fn: () => T): T {
  const start = performance.now();
  try {
    return fn();
  } finally {
    performance.measure(`couture:${name}`, { start, end: performance.now() });
  }
}

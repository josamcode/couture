// Shared, tiny state between the scroll timeline and the WebGL painting.
// `progress` is 0 (painting) → 1 (line-art). ScrollTrigger tweens it; the shader reads it.
export const paintingState = { progress: 0 };

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export const onIdle = (cb: () => void, timeout = 1500) => {
  if ('requestIdleCallback' in window) window.requestIdleCallback(cb, { timeout });
  else setTimeout(cb, 200);
};

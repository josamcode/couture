// Hero painting files produced by `npm run images` (scripts/images.mjs + scripts/lineart.mjs).
export const HERO_WIDTHS = [640, 1280, 1920, 2560] as const;
export const HERO_RATIO = { width: 16, height: 9 } as const;

/** How wide the painting is drawn: ~60% of the window on desktop, nearly full width on phones. */
export const HERO_SIZES = '(min-width: 64em) 60vw, 92vw';

export const heroSrcset = (name: 'painting' | 'lineart', ext: 'avif' | 'webp') =>
  HERO_WIDTHS.map((w) => `/img/hero/${name}-${w}.${ext} ${w}w`).join(', ');

export const HERO_FALLBACK = { src: '/img/hero/painting-1280.jpg', width: 1280, height: 720 } as const;

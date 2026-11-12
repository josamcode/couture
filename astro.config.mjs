// @ts-check
import { defineConfig, fontProviders } from 'astro/config';

// Fonts are self-hosted from the installed @fontsource packages (no network at build time, no CDN
// at runtime). Only the Latin subset files are referenced. Astro generates metric-matched fallbacks
// (size-adjust), so the swap from fallback to web font causes no layout shift.
// (The built-in `npm` provider would do this in one line, but in Astro 7.4 it fails on Windows paths,
//  so the files are listed explicitly with the `local` provider.)
const local = fontProviders.local();
const LATIN =
  'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD';
const file = (pkg, name) => `./node_modules/@fontsource/${pkg}/files/${name}.woff2`;
const variant = (pkg, weight, style) => ({
  weight,
  style,
  display: 'swap',
  unicodeRange: [LATIN],
  src: [file(pkg, `${pkg}-latin-${weight}-${style}`)],
});

export default defineConfig({
  // Set SITE_URL when building for production so canonical + Open Graph URLs are absolute.
  site: process.env.SITE_URL || undefined,
  output: 'static',
  build: {
    // All CSS is small and goes in the document: no render-blocking stylesheet request.
    inlineStylesheets: 'always',
  },
  fonts: [
    {
      provider: local,
      name: 'Bodoni Moda',
      cssVariable: '--font-display',
      fallbacks: ['serif'],
      options: { variants: [variant('bodoni-moda', 400, 'normal'), variant('bodoni-moda', 400, 'italic')] },
    },
    {
      provider: local,
      name: 'Jost',
      cssVariable: '--font-text',
      fallbacks: ['sans-serif'],
      options: { variants: [variant('jost', 400, 'normal'), variant('jost', 500, 'normal')] },
    },
  ],
  vite: {
    build: {
      // Keep GSAP, Lenis and OGL in separate lazy chunks; nothing here should be inlined into HTML.
      assetsInlineLimit: 0,
    },
  },
});

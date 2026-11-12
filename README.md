# Couture UI — website

One page, exactly three sections, built to prove the taste it sells.

> AI makes off-the-rack. We make couture.

- **I · The atelier** (ink): the headline, the painting. Scroll and the painting grows to fill the
  screen, redraws itself as glowing line-art lit by a candle that follows your pointer, then the
  paper tears over it.
- **II · The collection** (ivory): the fitting room. The section holds still and scrolling walks
  through the looks I → VI; inside each look the divider sweeps across, so the generic page gets
  dressed as you scroll. You can also drag it yourself.
- **III · The wardrobe** (ink): the closing statement, the offer, the drawing returning in the
  dark, the wordmark rising at the very end.

Stack: Astro 7 (static), plain CSS, GSAP (ScrollTrigger, SplitText), Lenis, OGL, sharp,
Playwright, Lighthouse CI. No analytics, no trackers, no cookies, no external requests.

---

## Run it

You need Node 22 or newer.

```bash
npm install
```

```bash
npm run build
```

```bash
npm run serve
```

Then open http://localhost:4321.

> **Do not open `dist/index.html` by double-clicking it.** Without a server the scripts cannot
> load and nothing moves. Always use `npm run serve` (or `npm run dev` while editing).

`npm run serve` serves `dist/` the way Cloudflare will (same headers, compression, caching).
`npm run dev` is Astro's live-reloading server for editing.

---

## 1. Replace the hero painting

The painting on the site today is a **placeholder**: Bronzino, *Portrait of a Young Man* (1530s),
The Metropolitan Museum of Art, public domain. The footer shows a credit line while it is in use.

When your own painting ("The fitting") is ready:

1. Save it as **`assets-src/hero/painting.jpg`** (replace the file that is there).
   Best: 16:9, at least 2560 px wide. Other shapes are centre-cropped to 16:9. PNG or WebP also
   work (`painting.png`, `painting.webp`).
2. Run:

   ```bash
   npm run images
   ```

   This makes every size (AVIF + WebP at 640 / 960 / 1280 / 1920 / 2560) and the line-art
   version of the painting, into `public/img/hero/`.
3. Look at `public/img/hero/lineart-1280.webp` on a dark background. If the drawing is too busy
   or too empty, change the numbers at the top of `scripts/lineart.mjs` (each one is explained
   there) and run `npm run lineart` again.
4. Open **`src/data/credits.ts`** and, in `HERO_ARTWORK`:
   - set `placeholder: false` (this removes the credit line from the footer),
   - rewrite `alt` to describe your painting in one sentence.
5. `npm run build`.

The shader that turns the painting into the drawing zooms toward a point in the picture (the
sitter's face in the placeholder). If the important part of your painting is somewhere else,
change `vec2 focal = vec2(0.5, 0.36);` in `src/scripts/painting.ts` (x and y from 0 to 1, measured
from the top left).

## 2. Edit looks, names, prices and preview images

Everything about the looks is in **`src/data/looks.ts`**. You never need to touch a component.

- **Rename a look / change its tagline:** edit the line for that look at the bottom of the file:
  `look('I', 'editorial', 'Editorial', 'For brands that should read like a magazine cover.')`
  (numeral, slug, name, tagline). The slug is used in file paths and in `data-checkout`; if you
  change it, rename the image folder too.
- **Prices:** every look starts as `[YOUR PRICE]`. Give a look its price by adding a last argument:
  `look('I', 'editorial', 'Editorial', '…', { price: '$49' })`. The wardrobe price is in
  **`src/data/site.ts`** (`WARDROBE.price`).
- **"[NUMBER] prompts":** in `contents()` in `looks.ts`.
- **Buy buttons:** each look points to `#` until you add `{ href: 'https://…' }` the same way; the
  wardrobe has `WARDROBE.href` in `site.ts`. Put your checkout links there once you have a payment provider. Until then a click does nothing.
  Every button also carries `data-checkout="look-<slug>"` / `data-checkout="wardrobe"` and fires a
  `couture:checkout` event, if a provider needs to hook in by script.
- **Add or remove a look:** add or remove a `look(...)` line. The index, the scroll scene and the
  buttons follow automatically.

### Preview images (the before/after frame)

The preview images are **demo mock-ups, not real outputs from real skills.** They were built by
hand: for each look, two small pages for the fictional coffee roaster "Northwind" in
`demo-looks/<slug>/` (`off-the-rack.html` = the generic AI page, `couture.html` = the same page in
that look). While a look has `placeholder: true`, the site labels its frame "Illustrative preview"
and the footer says the previews are mock-ups.

To replace them with real outputs:

1. Put two images per look in `public/img/looks/<slug>/`, each in four files:
   `off-the-rack-1600.avif`, `off-the-rack-1600.webp`, `off-the-rack-800.avif`,
   `off-the-rack-800.webp`, and the same four for `couture-…`. Size 1600×1000 and 800×500.
   The easy way: replace `demo-looks/<slug>/off-the-rack.html` and `couture.html` with the real
   generated pages and run

   ```bash
   npm run demo-shots
   ```

   which screenshots them at 1600×1000 and writes all eight files.
2. In `src/data/looks.ts`, add `{ placeholder: false }` as the last argument of that look.
3. `npm run build`.

## 3. Brand files

In `public/brand/`:

| File | Status |
|---|---|
| `couture-ui-mark-transparent.png` | yours (copied from the project root) |
| `couture-ui-profile.png` | yours (copied from the project root) |
| `couture-ui-mark.svg` | **temporary** vector redraw of the mark (Bodoni Moda "C" as an outline + the red dot). Drop the final SVG here with the same name to replace it. |

After changing any of them:

```bash
npm run mark
```

```bash
npm run og
```

The first regenerates the favicon and touch icon, the second the 1200×630 share image.
The wordmark in the header and footer is HTML/CSS, not an image.

## 4. Deploy to Cloudflare

The site is a folder of static files: `dist/`. Build it with your real address so share links and
the canonical URL are absolute (PowerShell):

```powershell
$env:SITE_URL = "https://your-domain.com"; npm run build
```

**With Wrangler (command line):**

```bash
npx wrangler login
```

```bash
npx wrangler pages project create couture-ui
```

```bash
npx wrangler pages deploy ./dist --project-name couture-ui
```

The first command opens the browser to sign in to your Cloudflare account. The second is needed
once. The third uploads `dist/`; run it again after every build.

**With the dashboard (no command line):** Cloudflare dashboard → **Workers & Pages** →
**Create application** → **Get started** → **Drag and drop your files** → name the project → drag
the `dist` folder in → **Deploy site**. To update later: open the project →
**Create a new deployment** → drag the new `dist` folder.

Then add your domain in the project's **Custom domains** tab.

`dist/_headers` (from `public/_headers`) sets caching and security headers on Cloudflare,
including a Content-Security-Policy that only allows the site's own files. If you later add a
payment provider's script, its domain has to be added there.

Do not use Vercel's free plan for this site: it does not allow commercial use.

---

## Checks (all of these must pass before shipping)

```bash
npm run build
```

Type-checks, builds, and fails if a size budget is broken (JS ≤ 150 KB compressed, hero image for
phones ≤ 250 KB, fonts, HTML).

```bash
npm test
```

113 Playwright checks on Chromium, Firefox, WebKit, a Pixel and an iPhone profile: zero console
errors or warnings, header links, every look by click and keyboard, the slider by mouse / touch /
keyboard, reduced motion, JavaScript off, WebGL off. Plus two scroll recordings that fail on any
main-thread task over 50 ms (`qa/perf/`).

```bash
npm run lhci
```

Lighthouse CI on `dist/`, mobile and desktop, 3 runs each, with the budgets as assertions
(Performance ≥ 90, Accessibility / Best Practices / SEO ≥ 95, LCP ≤ 2.5 s, TBT ≤ 200 ms,
CLS ≤ 0.1). Reports go to `qa/lighthouse/`.

```bash
npm run screenshots
```

Screenshots of every section and every scroll scene at 390×844, 768×1024, 1440×900, 1920×1080 and
a narrow WebKit phone, into `qa/screenshots/` (needs `npm run serve` running).

Never lower a budget to make a check pass. Fix the cause.

---

## Where things are

```
src/
  pages/index.astro         the page: Hero, Collection, Wardrobe
  layouts/Base.astro        <head>, fonts, header, footer, script boot
  components/               Hero, Collection, Compare, Wardrobe, Header, Footer, TornEdge,
                            ChapterRail, Motes, Wordmark
  data/
    looks.ts                THE COLLECTION (names, taglines, prices, images)
    site.ts                 site name, Instagram, wardrobe offer
    credits.ts              every third-party asset, its source and license
    motion.ts               THE motion system: 2 eases, 3 durations, staggers, scrub
    hero.ts, torn.ts        image sizes; the torn-edge path (generated)
  scripts/
    main.ts                 entry: headline reveal, look index, slider (runs after first paint)
    scroll.ts               every scroll scene (lazy)
    painting.ts             the one WebGL effect, OGL (lazy)
    collection.ts, compare.ts, state.ts
  styles/global.css         brand tokens (locked) and base styles
scripts/                    build helpers: images, lineart, torn, mark, og, demo-shots,
                            screenshots, lighthouse, serve, check-budget, postbuild
demo-looks/                 sources of the placeholder preview images
assets-src/hero/            the source painting (+ SOURCE.json: where the placeholder came from)
public/                     static files: brand/, img/, _headers, icons, og.png
tests/                      Playwright tests
qa/                         research.md, reviews.md, screenshots/, lighthouse/, perf/
```

## How the motion is built (for whoever edits it)

- **One motion system.** `src/data/motion.ts` holds the only easings (`expo.out`, `power3.inOut`)
  and durations (0.4 s, 0.9 s, 1.4 s). CSS gets the same values as custom properties.
  Only `transform`, `opacity` and `clip-path` are animated.
- **Pinned scenes are CSS `position: sticky`,** not JavaScript pinning. ScrollTrigger only measures
  progress; styles are written on the animation frame, never inside the scroll event.
- **Reveals are CSS transitions.** Put `data-rise="group-name"` on an element (optional
  `style="--i:2"` for its place in the stagger); the group rises the first time any member scrolls
  into view.
- **Nothing is hidden without JavaScript.** Content is only hidden for animation after an inline
  script adds `js` and `motion` to `<html>`, and a timer shows everything if the scripts never
  arrive. With JavaScript off the page reads top to bottom with all six looks listed.
- **Reduced motion** (`prefers-reduced-motion`): no smooth scroll, no reveals, no WebGL, no pinned
  scenes. A normal, finished page.
- **WebGL is optional everywhere.** The plain `<img>` is the fallback and the LCP element. The
  effect is skipped for reduced motion, Save-Data, low-end devices, or no WebGL; it starts on the
  visitor's first movement (or after a few idle seconds), adapts its resolution to the frame rate,
  and stops rendering when off screen.

## Third-party material

Listed with sources and licenses in `src/data/credits.ts`: the placeholder painting (The Met,
public domain / CC0) and the fonts (SIL Open Font License). Nothing else was downloaded.
The three reference sites studied in `qa/research.md` were used for principles only; no artwork,
copy, code or layout was taken from them.

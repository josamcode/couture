# Phase 0 · Reference study

Studied on 2026-11-12 in a real (headed, GPU) Chromium driven by Playwright:
`scripts/study.mjs` wheel-scrolls each site slowly and saves a screenshot per stop plus a
`facts.json` (fonts, canvases, libraries, heading styles); `scripts/study-fine.mjs` re-runs one
stretch in small steps to read a transition. Screenshots live in `qa/research/` and are
git-ignored on purpose: they are study notes of other people's work, not assets.

Rule kept throughout: **principles, rhythm and technique only.** No artwork, image, copy, code or
exact layout from any reference is used on our site.

## 1. The Renaissance Edition — Shopify (main reference)

`https://www.shopify.com/editions/winter2026` · 54,069 px tall at 1440×900 · 2 canvases, 12 videos,
124 SVGs · `html.lenis` (Lenis smooth scroll) · Three.js present · fonts: a heavy grotesque
(NeueMontreal 700), a text serif (HWCigars 400) and a script face (ImperialScript) for initials.

What I saw:

- **The mash-up.** Renaissance figures cut out and re-staged with one loud modern object each
  (a hot-pink shopping bag, a skateboard, a purple mask, a laptop). The painting is treated with
  total seriousness; the joke is only in the object. One saturated accent against old-master tones.
- **Giant type, two voices.** Chapter words set huge in a tight grotesque (~194 px, line-height
  0.9, tracking −0.03em), answered by a light serif sentence with an oversized script initial.
  The title sets "ai" inside "Renaissance" in script: one stressed fragment, everything else plain.
- **Chapter index I–XII.** Fixed at the lower left: section names stacked tight, Roman numerals
  right-aligned in a second column, a dotted leader on the active row, inactive rows dimmed.
  It never moves; only the emphasis changes.
- **Torn paper.** Dark painted chapters end in an irregular torn edge; the paper-coloured content
  sheet (#DCDCD0-ish) sits *over* the painting, with a darker fibrous fringe and a soft shadow
  along the tear. The sheet scrolls at page speed while the painting behind it is held, so the
  paper reads as a physical layer sliding over the picture.
- **Header inverts.** White nav text over paintings, black over paper; the pill button swaps too.
- **Painting → line-art.** Between chapters the picture is redrawn as fine glowing white lines on
  near-black (a sketch of the same composition), with a light dust/grain field. It is a held,
  slow dissolve tied to scroll, not a cut.
- **Pacing.** Long holds. A chapter title stays for a full viewport of scroll before anything else
  happens; movements ease out long (no bounce, no overshoot); scroll is smoothed.

## 2. Oryzo — Lusion (tone reference)

`https://oryzo.ai/` · 56,691 px · 6 canvases · Three.js · fonts: a display sans, a text serif, a mono.

- **Absurd seriousness.** A cork coaster presented like aerospace hardware: "Thermodynamic
  stability", "Friction coefficient (est.) 0.80", "Now 37.9% more circular". The copy never winks.
- **One hero object, held centre**, while short text blocks arrive calmly beside it and leave.
- **Museum-plate labels.** Tiny uppercase captions, measurements, footnote asterisks, a quiet
  "Scroll to continue" cue at the bottom centre.

## 3. The Obsidian Assembly (typography-on-dark reference)

`https://obsidianassembly.com/` · 21,281 px · 2 canvases · fonts: a high-contrast display serif,
a text serif, a neutral sans (regular + medium).

- **Display serif at huge sizes**: hairlines survive because the type is very large, leading is
  tight (~0.95) and colour is an off-white, not pure white, on a warm near-black.
- **Counterpoint labels**: 11–12 px uppercase sans, generously tracked, placed far from the
  headline with lots of air. The contrast in scale is the design.
- **Counters and numerals** ("3/4", "(VI) The Elder") used as quiet wayfinding.
- **Dark ↔ ivory section flips** with a slow reveal of the first headline of each section.

## The 10 techniques we take, and how each is built in our stack

| # | Technique (principle) | Our build |
|---|---|---|
| 1 | **Old-master picture as the hero object**, framed and captioned like a museum plate | Plain `<picture>` (AVIF/WebP from `scripts/images.mjs`, sharp) as the LCP element inside a 16:9 frame with four CSS corner marks; caption row `Fig. I — The fitting` / `Scroll to enter` in Jost labels. |
| 2 | **Painting dissolves into glowing line-art on scroll** | One OGL full-screen triangle on a `<canvas>` over the `<img>`. Two textures (painting + line-art from `scripts/lineart.mjs`, Sobel in sharp). Fragment shader: fbm-noise threshold dissolve, soft ivory halo around lines, light film grain. `uProgress` tweened by a GSAP ScrollTrigger `scrub`. OGL is a dynamic import started from `requestIdleCallback` + IntersectionObserver; skipped entirely for reduced motion, Save-Data, low-end devices or no WebGL. |
| 3 | **Torn paper edge between ink and paper** | `scripts/torn.mjs` generates one natural rough path (seeded multi-octave noise + a few larger "tears") once; it is kept as a static asset (`src/data/torn.ts`) and inlined by `TornEdge.astro` as an SVG: main edge + a translucent fibre fringe + a stacked soft shadow. No filters, so it stays cheap to composite. |
| 4 | **Paper slides over a held picture** (curtain) | Desktop: Section I is a tall section with a CSS `position: sticky` stage (no JS pinning, so the compositor does the work); Section II overlaps it with a negative margin and rides over it. ScrollTrigger only scrubs transforms (stage drifts up a few percent = parallax). Phones: natural flow, the edge just overlaps. |
| 5 | **Numbered chapter index with Roman numerals** | The look index in Section II: an `<ol>` of buttons, numeral in a Jost label column, name in Bodoni Moda, active row italic + red dot, `aria-pressed`. Sticky on desktop (CSS), scroll-snap chip row on phones. |
| 6 | **Huge display type with one stressed word** | Bodoni Moda Regular, fluid `clamp()` sizes, line-height ≈ 0.95, slight negative tracking; exactly one italic word per headline and a red period as the only colour. |
| 7 | **Small tracked uppercase labels as counterpoint** | Jost 12 px, uppercase, 0.2–0.3em tracking for eyebrows, captions, index numerals, "In the box" titles; `--stone` on ink, `--stone-dark` on ivory (both checked ≥ 4.5:1). |
| 8 | **Header that inverts over paper and gets out of the way** | Fixed header; ScrollTrigger toggles `data-tone="ivory"` while the ivory section is under it (colour transition only) and adds/removes a class on scroll direction (transform only). Without JS the header is simply not fixed. |
| 9 | **Masked, eased text reveals with long holds** | GSAP SplitText: H1 by lines with `mask: "lines"` on load, Section III H2 by chars on enter; all tweens use the shared motion tokens (`expo.out` / `power3.inOut`; 0.4 / 0.9 / 1.4 s). Only `transform`, `opacity`, `clip-path` are animated. |
| 10 | **Smoothed scroll that keeps scroll-linked effects in sync** | Lenis on fine-pointer desktops only (dynamic import), driven from `gsap.ticker`, `lenis.on('scroll', ScrollTrigger.update)`, `lagSmoothing(0)`. Touch devices keep native scrolling. Reduced motion: no Lenis at all. |

Tone note taken from Oryzo and applied to copy handling: the product is described with a straight
face (spec-sheet "In the box" columns, figure captions) and nothing on the page winks.

## What we deliberately do **not** take

- No cut-out collage of existing paintings, no pink object motif, no script initials, no chapter
  count beyond our three sections, no 3D object, no intro loader, no custom cursor.
- Our torn edge is generated from our own noise; our shader is written from scratch; our layout is
  a three-section page with its own grid.

## Library notes checked against current docs before use

- **Astro 7.4**: `fonts` is a stable top-level config key; `fontProviders.npm({ remote: false })`
  reads the installed `@fontsource/*` packages, self-hosts the files, and generates metric-matched
  fallbacks (`size-adjust`) automatically; `<Font cssVariable preload />` from `astro:assets`.
- **GSAP 3.15**: all plugins ship in the public `gsap` package; `SplitText.create(el, { type, mask,
  autoSplit, onSplit })`; `gsap.matchMedia()` for setup/cleanup.
- **Lenis 1.3**: `new Lenis({ anchors })`, `lenis.raf(time)` from `gsap.ticker`, `syncTouch` left off.
- **OGL 1.0**: `Renderer`, `Program`, `Mesh`, `Triangle`, `Texture` are enough for a full-screen shader.
- **The Met Collection API**: `/v1/search` was retired on 2026-10-01; `/v1.1/search` is used
  instead. `/v1/objects/:id` still returns `isPublicDomain` and `primaryImage`.

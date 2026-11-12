# Review log

Everything that was found by review or by tests, what was done about it, and what was rejected and why.

Reviewer: **Codex** (Codex review plugin, `codex@openai-codex` 1.0.6,
`adversarial-review`, logged in with ChatGPT). Raw outputs are kept in `qa/codex/`.

How the reviews were run. The brief asks for a review after each phase. The plugin was installed
part-way through the build, and the sections were built together rather than strictly one after
another, so instead of five small reviews there are two full adversarial reviews of the whole site:
one of the complete build (commit `29fc5d9`, all three sections with the scroll scenes), and one of
the fixes that followed. Each was asked to attack performance and jank, accessibility, animation
edge cases (resize, fast scroll, back/forward cache, reduced motion toggled live), mobile touch
behaviour, progressive enhancement, and anything that looks generic or templated.

---

## Codex round 1 · the complete build (`debced7..29fc5d9`)

Verdict: **needs attention**. Four findings. All four were valid.

| # | Severity | Finding | Decision | What was done |
|---|---|---|---|---|
| 1 | high | **Oversized sticky spreads keep the purchase controls below the viewport.** On short screens (its example: 800×600) the held look is taller than the screen, and scrolling changes looks instead of revealing the price and buy button. | **Fixed** | Two layers. CSS: on phones and tablets the comparison frame now gives way to the height that is left (`width: min(100%, (100svh − name − price row) × 1.6)`), and the price and buy button sit directly under the frame. JS: a **fit guard** in `fittingRoom()` (`src/scripts/scroll.ts`) measures, on every refresh, whether the name, the frame and the buy button fit on screen while the look is held; if not (very short window, enlarged text) it sets `.is-plain` and nothing is held. New tests at 800×600, 375×560, 1024×640 and 600×500 assert that whenever a look is held, its name, frame and buy button are inside the viewport (`tests/resilience.spec.ts`). |
| 2 | medium | **Script-failure recovery leaves interactive layouts and dead navigation active.** If the entry module fails to load, the inline bootstrap has already added `js` and `motion`: the long sticky runways stay, the header stays fixed with no tone switching, and the look index is inert buttons (working links existed only inside `<noscript>`). | **Fixed** | The fail-safe timer in `<head>` (4 s, only if the scroll module has not come up) now restores a complete static page: every pinned-scene rule is scoped to `html.js.motion:not(.reveal-fallback)`, the header and the chapter rail only float when scripts are alive, and the index link list is always in the HTML and shown whenever the buttons cannot work. If the scripts arrive late, `initScroll()` removes the fail-safe class and the scenes come back. New test blocks every script file and checks: no sticky stages, header not fixed, all six looks visible, index links work, nothing left hidden. |
| 3 | medium | **Pending swaps can start after reduced motion is enabled.** The preference was checked before awaiting image decoding, not after, and a running swap was not cancelled when the preference changed. | **Fixed** | `select()` rechecks the preference after decoding; a `change` listener on the media query cancels a waiting swap, completes a running one and leaves exactly one look on show (`src/scripts/collection.ts`). New test toggles reduced motion mid-visit and back: scenes, Lenis and the WebGL canvas go away and return. |
| 4 | medium | **The advertised social preview image is missing from the branch.** `og:image` pointed at `/og.png`, which was not committed. | **Fixed** | `scripts/og.mjs` renders it from HTML with the real fonts (it fails if the fonts do not load); `public/og.png` is committed. |

Its closing suggestion: *"Measure frame pacing during first-interaction WebGL startup; the existing
warmed-up long-task tests do not establish that behaviour."* **Accepted.** Added
`tests/perf-gpu.spec.ts` (`npm run test:gpu`): a headed recording on a real GPU where the first
scroll wakes the effect up while the hero scene is moving. Result on this machine's integrated GPU
(Intel UHD, ANGLE/D3D11): longest main-thread task **43 ms**, none over 50 ms
(`qa/perf/webgl-startup-gpu.json`). The largest single step is creating the WebGL context (42 ms);
shader compile, the two texture uploads and the first frame are 2–9 ms each because they run as
separate tasks.

## Codex round 2 · the fixes (`29fc5d9..19e4406`)

Verdict: **needs attention**. It confirmed three of the round 1 fixes from source ("The blocked-script
and collection reduced-motion fixes are supported by source; the committed OG image is valid") and
raised three new findings. All three were valid.

| # | Severity | Finding | Decision | What was done |
|---|---|---|---|---|
| 5 | medium | **Enlarged text can collapse the comparison preview.** With a 32 px root font at 600×500 the height-aware width evaluates below zero, and plain mode did not restore the width. | **Fixed** | The frame has a usable floor (`max(15rem, …)` on phones, `max(22rem, …)` on desktop); if that does not fit, the fit guard turns the scene off and `.is-plain` restores a full-width frame. Testing this at 200% text also exposed real horizontal overflow on phones (headline minimums in rem, non-wrapping buttons and header links, an unconstrained grid column): headline sizes are now capped by the screen width, buttons and header links may wrap. New tests at 600×500, 390×844 and 1440×900 with doubled text assert a usable frame and no sideways scrolling. |
| 6 | medium | **Automatic look swaps hide the focused control.** If keyboard focus is on a look's slider or buy link when scrolling swaps the look, focus was left on a hidden element. | **Fixed** | Focus is carried across: the same control in the incoming look receives focus (slider → slider, buy → buy), in both the animated and the instant path (`focusKeeper` in `src/scripts/collection.ts`). New test focuses the buy link, scrolls into the next look, and expects focus on that look's buy link; same for the slider. |
| 7 | medium | **The start-up performance test discarded the start-up window** (it dropped the first 250 ms, exactly where the first interaction wakes WebGL) and could pass on an empty recording. | **Fixed, and it found a real problem** | The recording now waits out tracing start-up, marks the first interaction inside the trace, counts every task from that mark on, and fails on missing metadata or an empty recording. Measured honestly on the Intel integrated GPU, the first scroll blocked the main thread for **up to 408 ms** (creating the WebGL context), with further 50–70 ms tasks for texture uploads and buffer resizes. **Fix: the whole effect moved into a Web Worker with an OffscreenCanvas** (`src/scripts/painting.worker.ts`). Context creation, shader compile, texture decode and upload, and every frame now run off the main thread. Re-measured: longest main-thread task during first-scroll start-up **19.6 ms**, p99 6.6 ms, none over 50 ms (`qa/perf/webgl-startup-gpu.json`). Side effects, all good: the headless desktop scroll recording dropped from a 41 ms longest task to 23 ms, and browsers without OffscreenCanvas (Safari before 17) simply keep the static image. |

A third review round was not run: round 2's findings are fixed and each one is now pinned by a test
that fails without the fix.

---

## Found by our own tests and audits (before and between Codex rounds)

These are the issues the automated suite, the traces and Lighthouse turned up. All fixed.

**Correctness**

- **Line-art texture never loaded.** `data-lineart-1280` is read as `dataset['lineart-1280']`, not
  `dataset.lineart1280`, so the effect silently fell back to the static image. Renamed the
  attributes; added a test that the canvas really mounts and the line-art texture is requested.
- **Look swap race.** Selecting looks quickly could leave two looks on screen (a superseded swap
  advanced the "active" look without showing it). Rewritten around two states, *selected* and
  *shown*. Found by the keyboard test in Chromium and the click test in WebKit.
- **Touch drag on the slider ended instantly.** Taking pointer capture made the image under the
  finger fire `lostpointercapture`, which bubbled to the frame and ended the drag. Now only the
  frame's own capture loss ends it. Found by the CDP touch test.
- **Phone page was 1,235 px wide.** The look chips widened their grid column. `minmax(0, 1fr)`.
  A test asserts the page never scrolls sideways.
- **Hidden looks showed on phones.** A `display: flex` rule outranked `[hidden]`. Scoped to
  `:not([hidden])`.
- **Non-breaking hyphen drawn by a fallback font.** Bodoni Moda has no U+2011 glyph, so the hyphens
  in "off‑the‑rack" came from the fallback serif. The word now uses plain hyphens inside a
  `white-space: nowrap` span (same result: it never breaks).
- **Sticky runway that did not hold.** A sticky box cannot travel into its container's padding.
  The phone runway is now a real (empty) flex item.

**Console noise**

- **Firefox: "scroll-linked positioning effect" warning.** GSAP's built-in `scrub` (and Lenis'
  recommended `lenis.on('scroll', ScrollTrigger.update)` wiring) write transforms inside the scroll
  event. Reworked: ScrollTrigger only reports progress; a ticker moves the timelines on the
  animation frame. Look swaps requested by scroll are also deferred to the frame. Zero warnings in
  all three engines.
- **WebKit: "preloaded but not used" for fonts.** Cause: the preview server sent `no-cache`, so
  WebKit re-fetched preloaded fonts. Production will cache them. Added `public/_headers` for
  Cloudflare and a small server (`scripts/serve.mjs`) that applies the same headers, so tests,
  Lighthouse and screenshots all run against production behaviour.

**Performance**

- **Reveal set-up cost 180 ms on a throttled phone** (alternating style writes and layout reads;
  SplitText measuring; GSAP laying out hidden elements to read their transforms). Now: reveals are
  CSS transitions started by an IntersectionObserver, the Section III headline is split into
  characters at build time, ScrollTriggers are created in one batch after all poses are written, and
  each scene is set up in its own task. Largest set-up step at 4× CPU throttle: 24 ms.
- **WebGL warm-up blocked the main thread right after load.** Now "idle until needed": the texture
  is fetched quietly after load; the GPU work starts on the visitor's first movement or after 5 idle
  seconds, in separate small tasks, with the shader compiled off-thread where
  `KHR_parallel_shader_compile` exists.
- **Shader too heavy for weak GPUs** (140 ms frames in software rendering). Added adaptive
  resolution: the canvas starts at half resolution, steps up only while frames are fast, steps down
  and stays down if they slow.
- **Scripts ran before first paint.** The main module is now preloaded but executed after the first
  frame, so the hero image and text paint before any script work.
- **Look swaps restyled whole spreads** (`inert` and `visibility` flips). Swaps now animate opacity
  and transform only.

**Rejected or deliberately left**

- *"Use the non-breaking hyphen as the brief says."* Rejected: the font does not contain it, and a
  fallback glyph in a 110 px headline is worse than the equivalent nowrap span.
- *Keep the one-off "show me" sweep of the slider.* Replaced where the fitting-room scene runs:
  scrolling moves the divider through its whole range for every look, which teaches the same thing
  better. The sweep still exists for layouts without the scene (very short, wide windows).
- *Pin scenes with ScrollTrigger `pin`.* Rejected in favour of CSS `position: sticky`: no layout
  work in JavaScript, no pin-spacer, nothing to go wrong on resize.
- *Lighthouse with WebGL running during the audit.* The audit still runs with software WebGL
  enabled, but the effect no longer starts inside the audit window (it waits for interaction or 5
  idle seconds). This is deliberate scheduling, not a lowered budget; the start-up cost is measured
  separately and reported above.

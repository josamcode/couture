// Everything scroll-driven. Loaded lazily after the first screen has settled.
//
// Division of labour:
//   - ScrollTrigger MEASURES: where each trigger starts and ends, how far through we are,
//     when something enters. It refreshes itself on resize and font load.
//   - Styles are WRITTEN only on the animation frame (gsap.ticker), never inside the scroll event.
//     That keeps scrolling smooth and avoids the "scroll-linked positioning effect" warning in Firefox.
//
// Setup and cleanup go through gsap.matchMedia(): when a condition flips (resize across the desktop
// breakpoint, reduced motion switched on), everything built here is reverted and rebuilt.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type Lenis from 'lenis';
import { EASE, SCRUB } from '../data/motion';
import { nextTask, onIdle, paintingState, scroller, timed } from './state';
import { getCollection } from './collection';
import { compareControls, disableSweep } from './compare';
import type { PaintingHandle } from './painting';

gsap.registerPlugin(ScrollTrigger);

type Cleanup = () => void;
const noop: Cleanup = () => {};

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);
const $$ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => [
  ...root.querySelectorAll<T>(sel),
];

/**
 * Writes first, measuring last. Building the scenes means writing start poses (styles) and creating
 * ScrollTriggers (which measure layout). Doing them alternately forces a full layout every time,
 * which is slow on a long page. So while the scenes are being built, ScrollTrigger creation is
 * queued, and the queue is run in a few batches once all the writing is done.
 */
let measureQueue: (() => void)[] | null = null;
const whenMeasuring = (fn: () => void) => {
  if (measureQueue) measureQueue.push(fn);
  else fn();
};

/**
 * A scroll-linked timeline. ScrollTrigger reports progress (a number); the timeline is moved
 * toward it on each animation frame, easing in over about SCRUB seconds.
 *
 * `measure` is for timelines whose values depend on layout (function-based tween values):
 * on every refresh the timeline is rewound, the layout is measured, and the values are rebuilt.
 */
function scrubbed(tl: gsap.core.Timeline, vars: ScrollTrigger.StaticVars, measure?: () => void): Cleanup {
  tl.pause();
  let target = 0;
  let current = 0;
  let st: ScrollTrigger | undefined;
  whenMeasuring(() => {
    st = ScrollTrigger.create({
      ...vars,
      onRefreshInit: () => {
        if (measure) tl.progress(0);
      },
      onRefresh: (self) => {
        if (measure) {
          measure();
          tl.invalidate();
          tl.progress(current);
        }
        target = self.progress;
      },
      onUpdate: (self) => {
        target = self.progress;
      },
    });
  });
  const tick = (_time: number, deltaMs: number) => {
    if (current === target) return;
    // exponential approach: ~95% of the way there after SCRUB seconds, at any frame rate
    const k = 1 - Math.exp((-3 * deltaMs) / 1000 / SCRUB);
    current += (target - current) * k;
    if (Math.abs(target - current) < 0.0005) current = target;
    tl.progress(current);
  };
  gsap.ticker.add(tick);
  return () => {
    gsap.ticker.remove(tick);
    st?.kill();
  };
}

/**
 * Reveals on scroll. Elements carry data-rise="<group>"; their start pose and the movement are pure
 * CSS (see "Reveal on scroll" in global.css). All this does is add .is-in to a whole group the first
 * time any member of it comes into view. An IntersectionObserver does the watching, so nothing is
 * measured on the main thread and nothing runs while scrolling.
 * Members inside looks that are not on show join their group too, so a swapped-in look is never blank.
 */
function riseGroups(): Cleanup {
  const groups = new Map<string, HTMLElement[]>();
  for (const el of $$('[data-rise]')) {
    const name = el.dataset.rise!;
    if (!groups.has(name)) groups.set(name, []);
    groups.get(name)!.push(el);
  }
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const name = (entry.target as HTMLElement).dataset.rise!;
        const members = groups.get(name);
        if (!members) continue;
        groups.delete(name);
        for (const el of members) {
          el.classList.add('is-in');
          io.unobserve(el);
        }
      }
    },
    // a little inside the bottom edge, so the movement is seen rather than half missed
    { rootMargin: '0px 0px -9% 0px', threshold: 0.01 },
  );
  groups.forEach((members) => members.forEach((el) => io.observe(el)));
  return () => io.disconnect();
}

/** Header: hides on scroll down, returns on scroll up, turns ink-on-ivory over the ivory section. */
function header() {
  const el = $('[data-header]');
  const collection = $('[data-collection]');
  if (!el) return;

  // class and attribute changes only; the movement itself is a CSS transition
  ScrollTrigger.create({
    start: 0,
    end: 'max',
    onUpdate(self) {
      const y = self.scroll();
      el.classList.toggle('is-scrolled', y > 24);
      el.classList.toggle('is-hidden', self.direction === 1 && y > 120);
    },
  });

  if (collection) {
    const line = () => Math.round(el.offsetHeight / 2);
    ScrollTrigger.create({
      trigger: collection,
      start: () => `top top+=${line()}`,
      end: () => `bottom top+=${line()}`,
      onToggle: (self) => {
        el.dataset.tone = self.isActive ? 'ivory' : 'ink';
      },
    });
  }
}

/** The chapter rail (desktop): the red dot sits on the section that holds the middle of the screen. */
function chapterRail() {
  const rail = $('[data-rail]');
  if (!rail) return;
  const items = $$('[data-rail-item]', rail);
  const sections = items.map((item) => document.getElementById(item.dataset.railItem!));
  const setActive = (index: number) => {
    const i = Math.max(0, index);
    items.forEach((item, n) => item.classList.toggle('is-active', n === i));
    rail.dataset.tone = sections[i]?.dataset.tone ?? 'ink';
  };
  sections.forEach((section, i) => {
    if (!section || i === 0) return;
    ScrollTrigger.create({
      trigger: section,
      start: 'top center',
      onEnter: () => setActive(i),
      onLeaveBack: () => setActive(i - 1),
    });
  });
}

/**
 * Section I, desktop. The section is 360svh tall with a sticky 100svh stage (CSS), so there are
 * 260svh of scroll, used as one scene:
 *     0 →  40   the headline lifts away, the copy fades
 *     2 →  88   the painting grows until it fills the whole screen
 *    64 → 150   it redraws itself as line-art (the room goes dark; the pointer carries the light)
 *    66 → 260   and we keep travelling into it
 *   160 → 260   the ivory paper slides over
 */
function heroDesktop(hero: HTMLElement): Cleanup {
  const stage = $('[data-hero-stage]', hero);
  const inner = $('[data-hero-inner]', hero);
  const plate = $('[data-plate]', hero);
  const media = $('.plate__media', hero);
  if (!stage || !plate || !media) return noop;

  const grow = { x: 0, y: 0, scale: 1 };
  const measure = () => {
    const s = stage.getBoundingClientRect();
    const m = media.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    // scale about the centre of the picture, so the picture ends up centred and covering the stage
    gsap.set(plate, { transformOrigin: `${m.left - p.left + m.width / 2}px ${m.top - p.top + m.height / 2}px` });
    grow.scale = Math.max(s.width / m.width, s.height / m.height) * 1.01;
    grow.x = s.left + s.width / 2 - (m.left + m.width / 2);
    grow.y = s.top + s.height / 2 - (m.top + m.height / 2);
    plate.dataset.maxScale = grow.scale.toFixed(2); // lets the WebGL canvas size its buffer for the close-up
  };

  const tl = gsap.timeline({ defaults: { ease: EASE.none } });
  tl.to($$('[data-hero-line]', hero), { yPercent: -55, autoAlpha: 0, duration: 30, stagger: 7, ease: 'power2.in' }, 0)
    .to([$('[data-hero-eyebrow]', hero), $('[data-hero-copy]', hero)], { y: -28, autoAlpha: 0, duration: 30 }, 0)
    .to([$('[data-plate-caption]', hero), ...$$('.plate__corner', hero)], { autoAlpha: 0, duration: 22 }, 2)
    .to(plate, { x: () => grow.x, y: () => grow.y, scale: () => grow.scale, duration: 86, ease: EASE.inOut }, 2)
    .to(paintingState, { progress: 1, duration: 86 }, 64)
    .to(paintingState, { zoom: 1, duration: 194 }, 66)
    .to(inner, { yPercent: -4, duration: 100 }, 160);
  return scrubbed(tl, { trigger: hero, start: 'top top', end: 'bottom bottom' }, measure);
}

/**
 * Section I, phones and tablets. The plate is held mid-screen by CSS sticky over a 160svh runway:
 * it grows into a tall window on the picture, becomes the drawing, and the paper rises over it.
 */
function heroPhone(hero: HTMLElement): Cleanup {
  const plate = $('[data-plate]', hero);
  const media = $('.plate__media', hero);
  if (!plate || !media) return noop;

  const grow = { scale: 1 };
  const measure = () => {
    const m = media.getBoundingClientRect();
    const p = plate.getBoundingClientRect();
    gsap.set(plate, { transformOrigin: `${m.left - p.left + m.width / 2}px ${m.top - p.top + m.height / 2}px` });
    // grow until the picture is a tall window in the middle of the screen (its sides run off the edges)
    grow.scale = Math.max(1, window.innerWidth / m.width, (window.innerHeight * 0.56) / m.height);
    plate.dataset.maxScale = grow.scale.toFixed(2);
  };

  const tl = gsap.timeline({ defaults: { ease: EASE.none } });
  tl.to($('[data-hero-eyebrow]', hero), { y: -8, duration: 20 }, 0)
    .to($('[data-hero-copy]', hero), { y: -18, duration: 24 }, 0)
    .to([$('[data-plate-caption]', hero), ...$$('.plate__corner', hero)], { autoAlpha: 0, duration: 10 }, 9)
    .to(plate, { scale: () => grow.scale, duration: 32, ease: EASE.inOut }, 9)
    .to(paintingState, { progress: 1, duration: 32 }, 20)
    .to(paintingState, { zoom: 1, duration: 80 }, 20);
  return scrubbed(tl, { trigger: hero, start: 'top top', end: 'bottom bottom' }, measure);
}

/** Section I, any other window (wide but very short): plain flow, the painting dissolves as it leaves. */
function heroPlain(hero: HTMLElement): Cleanup {
  const tl = gsap.timeline({ defaults: { ease: EASE.none } });
  tl.to(paintingState, { progress: 1 }, 0)
    .to(paintingState, { zoom: 0.5 }, 0)
    .to($('[data-hero-copy]', hero), { y: -16 }, 0);
  return scrubbed(tl, {
    trigger: hero,
    start: 'top top',
    end: () => `+=${Math.round(window.innerHeight * 0.6)}`,
    invalidateOnRefresh: true,
  });
}

function heroScroll(mode: 'desktop' | 'phone' | 'plain'): Cleanup {
  const hero = $('[data-hero]');
  if (!hero) return noop;
  if (mode === 'desktop') return heroDesktop(hero);
  if (mode === 'phone') return heroPhone(hero);
  return heroPlain(hero);
}

/** The torn edges: the fibre fringe moves a few pixels against the sheet as it passes. */
function tornParallax(): Cleanup {
  const cleanups = $$('[data-torn]').map((torn) => {
    const fringe = $('[data-torn-fringe]', torn);
    if (!fringe) return noop;
    const tl = gsap.timeline().fromTo(fringe, { y: 12 }, { y: -10, ease: EASE.none });
    return scrubbed(tl, { trigger: torn, start: 'top bottom', end: 'bottom top' });
  });
  return () => cleanups.forEach((fn) => fn());
}

/**
 * The fitting room. The spread is held on screen by CSS sticky over a long runway (one stretch of
 * scroll per look). Scrolling walks through the looks I → VI; inside each stretch the divider sweeps
 * across, so the plain page is dressed in the look as you scroll. The frame turns slightly as it goes
 * and the giant numeral drifts behind it. Dragging the divider yourself takes over until the next look.
 */
function fittingRoom(): Cleanup {
  const section = $('[data-collection]');
  const collection = getCollection();
  const spreads = section && $('[data-spreads]', section);
  if (!section || !collection || !spreads) return noop;
  const slugs = collection.slugs;
  const n = slugs.length;
  disableSweep(); // scrolling teaches the divider better than a one-off sweep

  const frameOf = new Map(slugs.map((s) => [s, $(`#look-${s} [data-spread-compare] > *`, section)]));
  const ghostOf = new Map(slugs.map((s) => [s, $(`#look-${s} [data-ghost]`, section)]));
  const shownSpread = () => $('[data-spread]:not([hidden])', spreads);

  let index = 0; // which look the scroll position is on
  let local = 0; // 0 → 1 inside that look's stretch
  let pos = 52; // where the divider is being moved to
  let drawn = { index: -1, local: -1 };
  let pendingLook: string | null = null;

  // Fit guard. The scene only runs when the essentials of a look (its name, the frame, the price and
  // the buy button) fit on the screen while the look is held. On a short window, or with enlarged
  // text, nothing is held and the section stays a normal page (.is-plain switches the sticky CSS off).
  let plain = false;
  const checkFit = () => {
    section.classList.remove('is-plain'); // measure the scene's own layout
    const spread = shownSpread();
    if (!spread) return;
    const stick = parseFloat(getComputedStyle(spread).top) || 0;
    // offsetTop/offsetHeight: layout positions inside the spread, unaffected by transforms
    const bottoms = ['[data-spread-compare]', '.spread__buy'].map((sel) => {
      const el = $(sel, spread);
      return el ? el.offsetTop + el.offsetHeight : 0;
    });
    plain = stick + Math.max(...bottoms) > window.innerHeight - 8;
    section.classList.toggle('is-plain', plain);
    if (plain) {
      gsap.set([...frameOf.values(), ...ghostOf.values()].filter(Boolean), { clearProps: 'transform' });
      drawn = { index: -1, local: -1 };
    }
  };
  ScrollTrigger.addEventListener('refreshInit', checkFit);

  const read = (self: ScrollTrigger) => {
    if (plain) return;
    const p = self.progress * n;
    const i = Math.min(n - 1, Math.floor(p));
    local = Math.min(1, p - i);
    if (i !== index) {
      index = i;
      const control = compareControls.get(slugs[i]);
      if (control) control.touched = false; // a fresh look starts under scroll control again
      pendingLook = slugs[i]; // carried out on the next animation frame (never inside the scroll event)
    }
  };

  let st: ScrollTrigger | undefined;
  whenMeasuring(() => {
    checkFit();
    st = ScrollTrigger.create({
      trigger: spreads,
      // from the moment the spread sticks, for as long as the runway lasts
      start: () => `top top+=${parseFloat(getComputedStyle(shownSpread() ?? spreads).top) || 0}`,
      end: () => `+=${Math.max(1, spreads.offsetHeight - (shownSpread()?.offsetHeight ?? 0))}`,
      onUpdate: read,
      onRefresh: read,
      // coming back up from below: whatever was picked by hand, the scroll position decides again
      onEnterBack: (self) => {
        index = -1;
        read(self);
      },
    });
  });

  // Index clicks: while the scene is in play (or still ahead), travel to that look's stretch.
  // Past the end of the runway, swap in place so the visitor is not dragged back up the page.
  collection.setNavigator((slug) => {
    if (plain || !st || st.progress >= 1) return false;
    const i = slugs.indexOf(slug);
    if (i < 0) return false;
    scroller.to(st.start + ((i + 0.5) / n) * (st.end - st.start));
    return true;
  });

  const ease = gsap.parseEase(EASE.inOut);
  const tick = () => {
    if (plain) return;
    if (pendingLook) {
      collection.select(pendingLook);
      pendingLook = null;
    }
    if (drawn.index === index && drawn.local === local) return;
    const slug = slugs[index];
    // the page is dressed between 14% and 86% of the stretch: the divider travels right → left
    const t = Math.min(1, Math.max(0, (local - 0.14) / 0.72));
    const target = 88 - 76 * ease(t);
    const control = compareControls.get(slug);
    if (control && !control.touched) {
      pos += (target - pos) * (drawn.index === index ? 0.2 : 1);
      if (Math.abs(target - pos) < 0.05) pos = target;
      control.follow(pos);
    }
    // a slow sway that is level at both ends of the stretch
    gsap.set(frameOf.get(slug) ?? null, { rotationY: -4.5 * Math.sin(local * Math.PI * 2) });
    gsap.set(ghostOf.get(slug) ?? null, { yPercent: 18 - 36 * local });
    // keep ticking until the divider has caught up
    if (!control || control.touched || pos === target) drawn = { index, local };
    else drawn = { index, local: -1 };
  };
  gsap.ticker.add(tick);

  return () => {
    gsap.ticker.remove(tick);
    ScrollTrigger.removeEventListener('refreshInit', checkFit);
    section.classList.remove('is-plain');
    collection.setNavigator(null);
    st?.kill();
    gsap.set([...frameOf.values(), ...ghostOf.values()].filter(Boolean), { clearProps: 'transform' });
  };
}

/** Section II: the paper arrives. Headline out of its mask, index in a cascade, the frame tilts up. */
function collectionScene(scene: boolean): Cleanup {
  const section = $('[data-collection]');
  if (!section) return noop;
  const cleanups: Cleanup[] = [];

  // (the headline, the index, the look's name, box and price rise in through riseGroups: pure CSS)

  // the giant numeral drifts behind the spread
  // (only the look on show: measuring transforms on hidden elements makes the browser lay them out)
  const ghost = $('[data-spread]:not([hidden]) [data-ghost]', section);
  if (ghost && !scene) {
    const tl = gsap.timeline().fromTo(ghost, { yPercent: 16 }, { yPercent: -22, ease: EASE.none });
    cleanups.push(scrubbed(tl, { trigger: '[data-spreads]', start: 'top bottom', end: 'bottom top' }));
  }

  // the comparison frame tilts up off the table as it comes into view
  const frames = $('[data-spread]:not([hidden]) [data-spread-compare] > *', section);
  if (frames) {
    const tl = gsap
      .timeline()
      .fromTo(
        frames,
        { rotationX: 16, y: 70, scale: 0.94, autoAlpha: 0.35 },
        { rotationX: 0, y: 0, scale: 1, autoAlpha: 1, ease: EASE.none },
      );
    cleanups.push(scrubbed(tl, { trigger: '[data-spreads]', start: 'top 96%', end: 'top 30%' }));
  }

  return () => cleanups.forEach((fn) => fn());
}

/** Section III: the ink sheet slides over the paper; the drawing returns; the statement appears. */
function wardrobeScene(): Cleanup {
  const section = $('[data-wardrobe]');
  if (!section) return noop;
  const cleanups: Cleanup[] = [];

  // the paper is held back a little while the ink covers it (curtain)
  const paper = $('[data-collection-wrap]');
  if (paper) {
    const tl = gsap.timeline().to(paper, { y: () => window.innerHeight * 0.11, ease: EASE.none });
    cleanups.push(scrubbed(tl, { trigger: section, start: 'top bottom', end: 'top top', invalidateOnRefresh: true }));
  }

  // the drawing from Section I comes back out of the dark and drifts
  const sketch = $('[data-sketch]', section);
  if (sketch) {
    const tl = gsap
      .timeline()
      .fromTo(sketch, { yPercent: 14, scale: 1.16, opacity: 0 }, { yPercent: -8, scale: 1, opacity: 0.22, ease: EASE.none });
    cleanups.push(scrubbed(tl, { trigger: section, start: 'top 85%', end: 'bottom bottom' }));
  }

  // (the headline's characters, the body line and the card rise in through riseGroups: pure CSS)

  // the closing signature: the wordmark rises out of the floor as the page ends
  const sign = $('[data-sign]');
  if (sign) {
    const tl = gsap
      .timeline({ defaults: { ease: EASE.none } })
      .fromTo($('[data-sign-word]', sign), { yPercent: 72 }, { yPercent: 0, duration: 1 }, 0)
      .fromTo($('[data-sign-ui]', sign), { yPercent: 160, opacity: 0 }, { yPercent: 0, opacity: 1, duration: 0.7 }, 0.3)
      .fromTo($('[data-sign-dot]', sign), { scale: 0 }, { scale: 1, duration: 0.3 }, 0.7);
    cleanups.push(scrubbed(tl, { trigger: sign, start: 'top bottom', end: 'bottom bottom' }));
  }

  return () => cleanups.forEach((fn) => fn());
}

/** Lenis smooth scrolling. Fine pointers only: touch scrolling is never smoothed. */
function smoothScroll(): Cleanup {
  let lenis: Lenis | undefined;
  let dead = false;
  const tick = (time: number) => lenis?.raf(time * 1000);

  import('lenis').then(({ default: LenisCtor }) => {
    if (dead) return;
    lenis = new LenisCtor({
      lerp: 0.1,
      smoothWheel: true,
      syncTouch: false,
      anchors: true, // header links glide to their section
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    const instance = lenis;
    scroller.to = (y) => instance.scrollTo(y);
  });

  const nativeTo = scroller.to;
  return () => {
    dead = true;
    scroller.to = nativeTo;
    gsap.ticker.remove(tick);
    gsap.ticker.lagSmoothing(500, 33);
    lenis?.destroy();
    lenis = undefined;
  };
}

/** Is this device worth starting WebGL on? If not, the static image simply stays. */
function webglAllowed() {
  const nav = navigator as Navigator & { connection?: { saveData?: boolean }; deviceMemory?: number };
  if (nav.connection?.saveData) return false;
  if (typeof nav.deviceMemory === 'number' && nav.deviceMemory <= 4) return false;
  if (typeof nav.hardwareConcurrency === 'number' && nav.hardwareConcurrency <= 4) return false;
  return true;
}

/**
 * The single WebGL effect, on an "idle until needed" schedule:
 *   - after load, when idle: the line-art texture is fetched quietly (network only, so it is cached);
 *   - at the visitor's first sign of movement (pointer, touch, wheel, key, scroll), or after a few
 *     idle seconds, whichever comes first: OGL is imported and the GPU work is done, in small steps;
 *   - and only if the plate is near the viewport.
 * Nothing here is part of loading the page: until the visitor scrolls, the canvas would show
 * exactly what the image already shows.
 */
function paintingEffect(): Cleanup {
  const plate = $('[data-plate]');
  if (!plate || !webglAllowed()) return noop;

  let handle: PaintingHandle | null = null;
  let dead = false;
  let started = false;
  let timer = 0;
  let io: IntersectionObserver | undefined;
  const INTENT = ['pointermove', 'pointerdown', 'touchstart', 'wheel', 'keydown', 'scroll'] as const;

  const mount = () => {
    if (dead || started) return;
    started = true;
    window.clearTimeout(timer);
    INTENT.forEach((type) => window.removeEventListener(type, mount));
    io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io?.disconnect();
        import('./painting')
          .then((m) => m.mountPainting(plate, paintingState))
          .then((h) => {
            if (dead) h?.destroy();
            else handle = h;
          })
          .catch(() => {
            /* the static image stays; nothing else to do */
          });
      },
      { rootMargin: '300px 0px' },
    );
    io.observe(plate);
  };
  const afterLoad = () =>
    onIdle(() => {
      if (dead || started) return;
      // warm the HTTP cache with the drawing (low priority, off the main thread)
      const src = $<HTMLImageElement>('[data-plate-img]', plate)?.dataset.lineartSm;
      if (src) fetch(src, { priority: 'low' } as RequestInit).catch(() => undefined);
      INTENT.forEach((type) => window.addEventListener(type, mount, { passive: true, once: true }));
      timer = window.setTimeout(mount, 5000);
      if (window.scrollY > 0) mount(); // the page was opened part-way down
    }, 2500);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  return () => {
    dead = true;
    window.clearTimeout(timer);
    INTENT.forEach((type) => window.removeEventListener(type, mount));
    io?.disconnect();
    window.removeEventListener('load', afterLoad);
    handle?.destroy();
    handle = null;
  };
}

export function initScroll() {
  // The scenes are alive: undo the fail-safe if it fired while this module was still downloading
  // (it shows everything and switches the pinned scenes off when scripts do not arrive in time).
  document.documentElement.classList.remove('reveal-fallback');
  timed('header', header);
  timed('rail', chapterRail);
  const fontsWereReady = document.fonts.status === 'loaded';

  const mm = gsap.matchMedia();
  mm.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 64em) and (min-height: 38.75em)',
      phone: '(max-width: 63.99em) and (min-height: 30em)',
      finePointer: '(hover: hover) and (pointer: fine)',
    },
    (ctx) => {
      const { motion, desktop, phone, finePointer } = ctx.conditions as Record<string, boolean>;
      // Reduced motion: no smooth scroll, no reveals, no WebGL. Content simply is there.
      if (!motion) return;

      const cleanups: Cleanup[] = [];
      let cancelled = false;
      const queue: (() => void)[] = [];
      measureQueue = queue; // from here on, ScrollTriggers are created at the end (see whenMeasuring)
      const steps: [string, () => Cleanup | void][] = [
        ['rise-groups', riseGroups],
        ['hero-scroll', () => heroScroll(desktop ? 'desktop' : phone ? 'phone' : 'plain')],
        ['torn', tornParallax],
        ['collection-scene', () => collectionScene(desktop || phone)],
        ['fitting-room', () => (desktop || phone ? fittingRoom() : undefined)],
        ['wardrobe-scene', wardrobeScene],
        ['painting-arm', paintingEffect],
      ];
      if (finePointer) steps.push(['smooth-scroll', smoothScroll]);

      // One step per task, so a slow phone can paint and respond in between.
      // ctx.add() records what each step creates, so matchMedia can still revert it all.
      (async () => {
        for (const [name, step] of steps) {
          if (cancelled) return;
          ctx.add(() => {
            const cleanup = timed(name, step);
            if (cleanup) cleanups.push(cleanup);
          });
          await nextTask();
        }
        // all poses are written: now measure, a few triggers at a time
        if (measureQueue === queue) measureQueue = null;
        while (queue.length && !cancelled) {
          const batch = queue.splice(0, 6);
          ctx.add(() => timed('measure', () => batch.forEach((fn) => fn())));
          await nextTask();
        }
        // a hook for tests and for anyone debugging: scroll-driven behaviour is now live
        document.documentElement.classList.add('scroll-ready');
      })();

      return () => {
        cancelled = true;
        cleanups.forEach((fn) => fn());
        paintingState.progress = 0;
        paintingState.zoom = 0;
      };
    },
  );
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('scroll-ready');
  }

  // Layout can move when fonts arrive late or the page returns from the back/forward cache.
  if (!fontsWereReady) document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) ScrollTrigger.refresh();
  });
}

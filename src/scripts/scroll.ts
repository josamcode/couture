// Everything scroll-driven. Loaded lazily after the first screen has settled.
// Setup and cleanup go through gsap.matchMedia(): when a condition flips (resize across the
// desktop breakpoint, reduced motion switched on), GSAP reverts what was built and rebuilds.
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { SplitText } from 'gsap/SplitText';
import type Lenis from 'lenis';
import { DUR, EASE, STAGGER } from '../data/motion';
import { onIdle, paintingState } from './state';
import type { PaintingHandle } from './painting';

gsap.registerPlugin(ScrollTrigger, SplitText);

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector<T>(sel);

/** Header: hides on scroll down, returns on scroll up, turns ink-on-ivory over the ivory section. */
function header() {
  const el = $('[data-header]');
  const collection = $('[data-collection]');
  if (!el) return;

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

/** Section I: the dissolve, the parallax, and (on desktop) the stage drifting under the paper. */
function heroScroll(desktop: boolean) {
  const hero = $('[data-hero]');
  if (!hero) return;
  const inner = $('[data-hero-inner]', hero);
  const eyebrow = $('[data-hero-eyebrow]', hero);
  const copy = $('[data-hero-copy]', hero);

  if (desktop) {
    // The section is 260svh tall with a sticky 100svh stage (CSS). Scroll length = 160svh:
    //   0 → 0.47   the painting dissolves into line-art while the stage holds still
    //   0.375 → 1  the ivory paper slides over; the stage drifts up a little (parallax)
    const tl = gsap.timeline({
      defaults: { ease: EASE.none },
      scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom bottom', scrub: true },
    });
    tl.to(paintingState, { progress: 1, duration: 0.47 }, 0)
      .to(eyebrow, { y: -10, duration: 0.45 }, 0)
      .to(copy, { y: -22, duration: 0.45 }, 0)
      .to(inner, { yPercent: -7, duration: 0.625 }, 0.375);
  } else {
    // Phones: natural flow. The painting dissolves as it travels up the first screen.
    const tl = gsap.timeline({
      defaults: { ease: EASE.none },
      scrollTrigger: {
        trigger: hero,
        start: 'top top',
        end: () => `+=${Math.round(window.innerHeight * 0.6)}`,
        scrub: true,
        invalidateOnRefresh: true,
      },
    });
    tl.to(paintingState, { progress: 1 }, 0).to(eyebrow, { y: -8 }, 0).to(copy, { y: -16 }, 0);
  }
}

/** The torn edges: the fibre fringe moves a few pixels against the sheet as it passes. */
function tornParallax() {
  gsap.utils.toArray<HTMLElement>('[data-torn]').forEach((torn) => {
    const fringe = $('[data-torn-fringe]', torn);
    if (!fringe) return;
    gsap.fromTo(
      fringe,
      { y: 10 },
      { y: -8, ease: EASE.none, scrollTrigger: { trigger: torn, start: 'top bottom', end: 'bottom top', scrub: true } },
    );
  });
}

/** Section II: the headline rises out of its mask as the paper arrives. */
function collectionReveal() {
  const title = $('#collection-title');
  if (!title) return;
  SplitText.create(title, {
    type: 'lines',
    mask: 'lines',
    linesClass: 'reveal-ln',
    aria: 'none',
    autoSplit: true,
    onSplit(self) {
      return gsap.from(self.lines, {
        yPercent: 108,
        duration: DUR.base,
        ease: EASE.out,
        stagger: STAGGER.lines,
        scrollTrigger: { trigger: title, start: 'top 88%', once: true },
      });
    },
  });
}

/** Section III: the ink sheet's content rides up slightly; the headline reveals by characters. */
function wardrobeReveal() {
  const section = $('[data-wardrobe]');
  const title = $('[data-wardrobe-title]');
  const card = $('[data-wardrobe-card]');
  if (!section || !title) return;

  SplitText.create(title, {
    type: 'words,chars',
    charsClass: 'wardrobe__ch',
    aria: 'auto', // the heading keeps one readable label; the split characters are hidden from assistive tech
    autoSplit: true,
    onSplit(self) {
      return gsap.from(self.chars, {
        yPercent: 55,
        autoAlpha: 0,
        duration: DUR.base,
        ease: EASE.out,
        stagger: STAGGER.chars,
        scrollTrigger: { trigger: title, start: 'top 82%', once: true },
      });
    },
  });

  if (card) {
    gsap.from(card, {
      y: 28,
      autoAlpha: 0,
      duration: DUR.base,
      ease: EASE.out,
      scrollTrigger: { trigger: card, start: 'top 88%', once: true },
    });
  }
}

/** Lenis smooth scrolling. Fine pointers only: touch scrolling is never smoothed. */
function smoothScroll() {
  let lenis: Lenis | undefined;
  let dead = false;
  const tick = (time: number) => lenis?.raf(time * 1000);

  import('lenis').then(({ default: LenisCtor }) => {
    if (dead) return;
    lenis = new LenisCtor({
      lerp: 0.11,
      smoothWheel: true,
      syncTouch: false,
      anchors: true, // header links glide to their section
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
  });

  return () => {
    dead = true;
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

/** The single WebGL effect. Starts only after load, when idle, and when the plate is near the viewport. */
function paintingEffect() {
  const plate = $('[data-plate]');
  if (!plate || !webglAllowed()) return () => {};

  let handle: PaintingHandle | null = null;
  let dead = false;
  let io: IntersectionObserver | undefined;

  const mount = () => {
    if (dead) return;
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
  const afterLoad = () => onIdle(mount, 2500);
  if (document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  return () => {
    dead = true;
    io?.disconnect();
    window.removeEventListener('load', afterLoad);
    handle?.destroy();
    handle = null;
  };
}

export function initScroll() {
  header();

  const mm = gsap.matchMedia();
  mm.add(
    {
      motion: '(prefers-reduced-motion: no-preference)',
      desktop: '(min-width: 64em) and (min-height: 38.75em)',
      finePointer: '(hover: hover) and (pointer: fine)',
    },
    (ctx) => {
      const { motion, desktop, finePointer } = ctx.conditions as Record<string, boolean>;
      // Reduced motion: no smooth scroll, no reveals, no WebGL. Content simply is there.
      if (!motion) return;

      heroScroll(desktop);
      tornParallax();
      collectionReveal();
      wardrobeReveal();
      const stopSmooth = finePointer ? smoothScroll() : undefined;
      const stopPainting = paintingEffect();

      return () => {
        stopSmooth?.();
        stopPainting();
        paintingState.progress = 0;
      };
    },
  );

  // Layout can move when fonts arrive or the page returns from the back/forward cache.
  document.fonts.ready.then(() => ScrollTrigger.refresh());
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) ScrollTrigger.refresh();
  });
}

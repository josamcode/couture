// Entry script. Kept small on purpose: it only carries what the first screen needs
// (GSAP core + SplitText for the headline reveal) and the two functional widgets.
// ScrollTrigger, Lenis and OGL are loaded later, in their own chunks.
import { gsap } from 'gsap';
import { SplitText } from 'gsap/SplitText';
import { DUR, EASE, STAGGER } from '../data/motion';
import { initCollection } from './collection';
import { initCompare } from './compare';
import { nextTask, onIdle, prefersReducedMotion, timed } from './state';

gsap.registerPlugin(SplitText);

const root = document.documentElement;

// Keep the `motion` class honest if the user flips the OS setting while the page is open.
window
  .matchMedia('(prefers-reduced-motion: reduce)')
  .addEventListener('change', (e) => root.classList.toggle('motion', !e.matches));

/** H1 lines rise out of a mask on load. */
function heroIntro() {
  const title = document.querySelector<HTMLElement>('[data-hero-title]');
  if (!title || prefersReducedMotion()) {
    root.classList.add('is-ready');
    return;
  }
  // Split once the real fonts are in (they are preloaded), but never wait long.
  const fonts = Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 900))]);
  fonts.then(() => {
    SplitText.create(title, {
      type: 'lines',
      mask: 'lines',
      linesClass: 'hero__ln',
      aria: 'none', // lines keep whole words, so the heading reads normally
      autoSplit: true, // re-splits on resize / late font load and keeps the tween in sync
      onSplit(self) {
        return gsap.from(self.lines, {
          yPercent: 108,
          duration: DUR.base,
          ease: EASE.out,
          stagger: STAGGER.lines,
        });
      },
    });
    root.classList.add('is-ready');
  });
}

/** The painting settles from 1.06 to 1 the first time it comes into view. */
function plateIntro() {
  const scaleEl = document.querySelector<HTMLElement>('[data-plate-scale]');
  if (!scaleEl || prefersReducedMotion()) return;
  gsap.set(scaleEl, { scale: 1.06 });
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return;
      io.disconnect();
      gsap.to(scaleEl, { scale: 1, duration: DUR.slow, ease: EASE.out });
    },
    { threshold: 0.2 },
  );
  io.observe(scaleEl);
}

/**
 * Buy buttons. Payments are not decided yet, so buttons carry data-checkout and point to "#".
 * Until a real URL is set in the data files, a click does nothing (instead of jumping to the top).
 * A `couture:checkout` event is dispatched so a payment provider can be wired in later.
 */
function checkoutButtons() {
  document.addEventListener('click', (e) => {
    const link = (e.target as Element | null)?.closest<HTMLAnchorElement>('a[data-checkout]');
    if (!link) return;
    link.dispatchEvent(new CustomEvent('couture:checkout', { bubbles: true, detail: { id: link.dataset.checkout } }));
    if (link.getAttribute('href') === '#') e.preventDefault();
  });
}

// Start-up is split into small tasks so the main thread is never held for long on slow phones.
checkoutButtons();
timed('hero-intro', heroIntro);
timed('plate-intro', plateIntro);
(async () => {
  await nextTask();
  timed('collection', initCollection);
  await nextTask();
  timed('compare', initCompare);
  // Everything scroll-driven comes after the first screen is settled.
  onIdle(() => {
    import('./scroll').then((mod) => mod.initScroll());
  });
})();

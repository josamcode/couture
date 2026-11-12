// Section II: the look index swaps the look spread.
import { gsap } from 'gsap';
import { DUR, EASE } from '../data/motion';
import { prefersReducedMotion } from './state';

export interface CollectionApi {
  slugs: string[];
  /** Show a look (with the swap transition unless animate is false). */
  select(slug: string, animate?: boolean): void;
  /**
   * While a scroll scene owns the section, index clicks should scroll to the look instead of
   * swapping in place. The navigator returns true when it has taken care of the request.
   */
  setNavigator(fn: ((slug: string) => boolean) | null): void;
}
let api: CollectionApi | null = null;
export const getCollection = () => api;

export function initCollection() {
  const index = document.querySelector<HTMLElement>('[data-look-index]');
  const wrap = document.querySelector<HTMLElement>('[data-spreads]');
  if (!index || !wrap) return;

  const buttons = [...index.querySelectorAll<HTMLButtonElement>('button[data-look]')];
  const spreads = new Map<string, HTMLElement>();
  wrap.querySelectorAll<HTMLElement>('[data-spread]').forEach((el) => spreads.set(el.dataset.spread!, el));
  if (!buttons.length || !spreads.size) return;

  const initial = buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.look ?? buttons[0].dataset.look!;
  let selected = initial; // what the index says
  let shown = initial; // what is actually on screen (lags behind while images decode / a swap runs)
  let tl: gsap.core.Timeline | null = null;
  let token = 0;

  /** Start downloading a look's preview images (they are lazy and hidden until asked for). */
  const warm = (slug: string) => {
    spreads
      .get(slug)
      ?.querySelectorAll<HTMLImageElement>('img[loading="lazy"]')
      .forEach((img) => (img.loading = 'eager'));
  };
  const decoded = (slug: string) => {
    const imgs = [...(spreads.get(slug)?.querySelectorAll<HTMLImageElement>('.compare img') ?? [])];
    const all = Promise.all(imgs.map((img) => img.decode().catch(() => undefined)));
    // never hold the interface hostage to the network
    return Promise.race([all, new Promise((r) => setTimeout(r, 500))]);
  };

  const press = (slug: string) => {
    buttons.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.look === slug)));
    // keep the active chip in view on phones (horizontal only, never moves the page)
    const btn = buttons.find((b) => b.dataset.look === slug);
    const list = btn?.closest<HTMLElement>('.look-index__list');
    const item = btn?.parentElement;
    if (list && item && list.scrollWidth > list.clientWidth) {
      const left = item.offsetLeft - (list.clientWidth - item.offsetWidth) / 2;
      list.scrollTo({ left, behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
    }
  };

  const show = (slug: string) => {
    spreads.forEach((el, key) => {
      el.hidden = key !== slug;
    });
    shown = slug;
  };

  async function select(slug: string, animate = true) {
    if (slug === selected || !spreads.has(slug)) return;
    selected = slug;
    const mine = ++token;
    press(slug);
    warm(slug);

    if (!animate || prefersReducedMotion()) {
      tl?.progress(1);
      show(slug);
      return;
    }

    await decoded(slug);
    if (mine !== token) return; // a newer selection won; it will do the swap
    if (prefersReducedMotion()) {
      // the preference changed while the images were decoding
      tl?.progress(1);
      show(slug);
      return;
    }

    // finish whatever swap is still running, so exactly one spread is on screen before we start
    tl?.progress(1);
    if (slug === shown) return; // e.g. A → B → A in quick succession
    const from = spreads.get(shown)!;
    const to = spreads.get(slug)!;
    shown = slug;

    const frame = to.querySelector<HTMLElement>('.compare');
    to.hidden = false;
    // (opacity only, and no inert/visibility flips: each of those would restyle the whole spread)
    tl = gsap
      .timeline({
        onComplete: () => {
          from.hidden = true;
          gsap.set([from, to, frame], { clearProps: 'transform,opacity,clipPath' });
          tl = null;
        },
      })
      // the old spread lifts and fades
      .to(from, { y: -20, opacity: 0, duration: DUR.fast, ease: EASE.inOut })
      // the new one arrives
      .fromTo(to, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: DUR.base, ease: EASE.out })
      // and its comparison images wipe in
      .fromTo(
        frame,
        { clipPath: 'inset(0% 100% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.base, ease: EASE.inOut },
        '<',
      );
  }

  // Reduced motion switched on mid-visit: finish any swap at once and leave exactly one look on show.
  window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', (e) => {
    if (!e.matches) return;
    token++; // cancels a swap that is still waiting for its images
    tl?.progress(1);
    show(selected);
  });

  // initial state: only the selected spread is shown (CSS already keeps the others out of the first layout)
  show(selected);
  document.documentElement.classList.add('collection-ready');

  let navigator: ((slug: string) => boolean) | null = null;
  /** A request from the index: scroll to the look if a scene is running, otherwise swap in place. */
  const go = (slug: string) => {
    if (navigator?.(slug)) return;
    select(slug);
  };
  api = {
    slugs: buttons.map((b) => b.dataset.look!),
    select: (slug, animate = true) => void select(slug, animate),
    setNavigator: (fn) => {
      navigator = fn;
    },
  };

  buttons.forEach((btn, i) => {
    const slug = btn.dataset.look!;
    btn.addEventListener('click', () => go(slug));
    btn.addEventListener('pointerenter', () => warm(slug));
    btn.addEventListener('focus', () => warm(slug));
    // Arrow keys walk the index (and select, like tabs do).
    btn.addEventListener('keydown', (e) => {
      const last = buttons.length - 1;
      let next = -1;
      if (e.key === 'ArrowDown' || e.key === 'ArrowRight') next = i === last ? 0 : i + 1;
      else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') next = i === 0 ? last : i - 1;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = last;
      if (next < 0) return;
      e.preventDefault();
      buttons[next].focus({ preventScroll: true });
      go(buttons[next].dataset.look!);
    });
  });

  // Deep link: /#look-noir opens that look.
  const fromHash = () => {
    const m = location.hash.match(/^#look-(.+)$/);
    if (m && spreads.has(m[1])) select(m[1], false);
  };
  fromHash();
  window.addEventListener('hashchange', fromHash);
}

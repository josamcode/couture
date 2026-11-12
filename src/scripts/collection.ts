// Section II: the look index swaps the look spread.
import { gsap } from 'gsap';
import { DUR, EASE } from '../data/motion';
import { prefersReducedMotion } from './state';

export function initCollection() {
  const index = document.querySelector<HTMLElement>('[data-look-index]');
  const wrap = document.querySelector<HTMLElement>('[data-spreads]');
  if (!index || !wrap) return;

  const buttons = [...index.querySelectorAll<HTMLButtonElement>('button[data-look]')];
  const spreads = new Map<string, HTMLElement>();
  wrap.querySelectorAll<HTMLElement>('[data-spread]').forEach((el) => spreads.set(el.dataset.spread!, el));
  if (!buttons.length || !spreads.size) return;

  let active = buttons.find((b) => b.getAttribute('aria-pressed') === 'true')?.dataset.look ?? buttons[0].dataset.look!;
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
  };

  async function select(slug: string, animate = true) {
    if (slug === active || !spreads.has(slug)) return;
    const from = spreads.get(active)!;
    const to = spreads.get(slug)!;
    const mine = ++token;

    // finish whatever swap is still running, so state is always clean
    tl?.progress(1);
    active = slug;
    press(slug);
    warm(slug);

    if (!animate || prefersReducedMotion()) {
      show(slug);
      return;
    }

    await decoded(slug);
    if (mine !== token) return; // a newer click won

    const frame = to.querySelector<HTMLElement>('.compare');
    to.hidden = false;
    from.inert = true;
    tl = gsap
      .timeline({
        onComplete: () => {
          from.hidden = true;
          from.inert = false;
          gsap.set([from, to, frame], { clearProps: 'transform,opacity,visibility,clipPath' });
          tl = null;
        },
      })
      // the old spread lifts and fades
      .to(from, { y: -20, autoAlpha: 0, duration: DUR.fast, ease: EASE.inOut })
      // the new one arrives
      .fromTo(to, { y: 20, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: DUR.base, ease: EASE.out })
      // and its comparison images wipe in
      .fromTo(
        frame,
        { clipPath: 'inset(0% 100% 0% 0%)' },
        { clipPath: 'inset(0% 0% 0% 0%)', duration: DUR.base, ease: EASE.inOut },
        '<',
      );
  }

  // initial state: only the active spread is shown
  show(active);

  buttons.forEach((btn, i) => {
    const slug = btn.dataset.look!;
    btn.addEventListener('click', () => select(slug));
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
      select(buttons[next].dataset.look!);
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

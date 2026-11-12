import { expect, test } from '@playwright/test';
import { LOOKS, gotoReady } from './helpers';

test.describe('when things go wrong or change mid-visit', () => {
  test('if the scripts never arrive, everything is shown and the page is a plain page', async ({ page }) => {
    // HTML and CSS load, every script file is blocked
    await page.route('**/_astro/*.js', (route) => route.abort());
    await page.goto('/', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(4800); // the fail-safe in <head> fires after 4 s

    await expect(page.locator('html')).toHaveClass(/reveal-fallback/);
    await expect(page.locator('h1')).toBeVisible();

    // no pinned scenes: the hero is one screen, not a long held stage
    const hero = await page.evaluate(() => ({
      stage: getComputedStyle(document.querySelector('[data-hero-stage]')!).position,
      height: document.querySelector('[data-hero]')!.getBoundingClientRect().height,
      screen: window.innerHeight,
      spread: getComputedStyle(document.querySelector('[data-spread]')!).position,
    }));
    expect(hero.stage).not.toBe('sticky');
    expect(hero.spread).not.toBe('sticky');
    expect(hero.height).toBeLessThan(hero.screen * 1.7);

    // the header does not float (it could not switch to ink text over the ivory section)
    expect(await page.locator('[data-header]').evaluate((el) => getComputedStyle(el).position)).toBe('absolute');
    // the index is working links, not dead buttons
    await expect(page.locator('.look-index a[href="#look-noir"]')).toBeVisible();
    for (const b of await page.locator('.look-index button').all()) await expect(b).toBeHidden();
    await page.locator('.look-index a[href="#look-noir"]').click();
    await expect(page).toHaveURL(/#look-noir$/);

    // every look is on the page, and nothing is waiting to be revealed
    for (const look of LOOKS) {
      const spread = page.locator(`#look-${look.slug}`);
      await spread.scrollIntoViewIfNeeded();
      await expect(spread.locator('.spread__name')).toBeVisible();
    }
    const waiting = await page.evaluate(
      () =>
        [...document.querySelectorAll<HTMLElement>('[data-rise], [data-pre-hide]')].filter((el) => {
          const cs = getComputedStyle(el);
          return cs.opacity !== '1' || cs.visibility !== 'visible';
        }).length,
    );
    expect(waiting).toBe(0);
    await page.locator('#wardrobe-title').scrollIntoViewIfNeeded();
    await expect(page.locator('#wardrobe-title')).toBeVisible();
  });

  test('reduced motion switched on mid-visit turns the scenes off, and back on again', async ({ page, isMobile }) => {
    await gotoReady(page);
    const state = () =>
      page.evaluate(() => ({
        motion: document.documentElement.classList.contains('motion'),
        lenis: document.documentElement.classList.contains('lenis'),
        stage: getComputedStyle(document.querySelector('[data-hero-stage]')!).position,
        figure: getComputedStyle(document.querySelector('.hero__figure-cell')!).position,
        spread: getComputedStyle(document.querySelector('[data-spread]:not([hidden])')!).position,
        canvases: document.querySelectorAll('canvas').length,
      }));

    const before = await state();
    expect(before.motion).toBe(true);
    expect(before.spread).toBe('sticky');
    expect(isMobile ? before.figure : before.stage).toBe('sticky');

    await page.emulateMedia({ reducedMotion: 'reduce' });
    await expect.poll(async () => (await state()).motion).toBe(false);
    await page.waitForTimeout(600);
    const reduced = await state();
    expect(reduced.lenis).toBe(false);
    expect(reduced.stage).not.toBe('sticky');
    expect(reduced.figure).not.toBe('sticky');
    expect(reduced.spread).not.toBe('sticky');
    expect(reduced.canvases).toBe(0);
    await expect(page.locator('h1')).toBeVisible();

    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect.poll(async () => (await state()).motion).toBe(true);
    await expect.poll(async () => (await state()).spread).toBe('sticky');
  });

  test('resizing across the desktop breakpoint rebuilds the scenes without errors', async ({ page, isMobile }) => {
    test.skip(isMobile, 'desktop only');
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await gotoReady(page);
    await page.setViewportSize({ width: 800, height: 900 });
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('.hero__figure-cell')!).position)).toBe(
      'sticky',
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.waitForTimeout(900);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-hero-stage]')!).position)).toBe(
      'sticky',
    );
    // nothing is left transformed at rest at the top of the page
    const plate = await page.evaluate(() => getComputedStyle(document.querySelector('[data-plate]')!).transform);
    expect(['none', 'matrix(1, 0, 0, 1, 0, 0)']).toContain(plate);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(errors).toEqual([]);
  });

  test('back/forward cache: coming back to the page keeps it working', async ({ page }) => {
    await gotoReady(page);
    await page.evaluate(() => window.scrollTo({ top: 900, behavior: 'instant' }));
    await page.waitForTimeout(400);
    await page.goto('about:blank');
    await page.goBack({ waitUntil: 'load' });
    await page.waitForFunction(() => document.documentElement.classList.contains('scroll-ready'), null, {
      timeout: 15_000,
    });
    await expect(page.locator('h1')).toBeAttached();
    // the header still reacts to scrolling
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.waitForTimeout(500);
    await expect(page.locator('[data-header]')).not.toHaveClass(/is-hidden/);
  });
});

test.describe('the fitting room on awkward screens', () => {
  const essentialsOnScreen = (page: import('@playwright/test').Page) =>
    page.evaluate(() => {
      const spread = document.querySelector<HTMLElement>('[data-spread]:not([hidden])')!;
      const inView = (el: Element | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top >= -1 && r.bottom <= window.innerHeight + 1;
      };
      return {
        held: getComputedStyle(spread).position === 'sticky',
        plain: document.querySelector('[data-collection]')!.classList.contains('is-plain'),
        name: inView(spread.querySelector('.spread__name')),
        frame: inView(spread.querySelector('[data-compare]')),
        buy: inView(spread.querySelector('a[data-checkout]')),
      };
    });

  for (const size of [
    { width: 800, height: 600 },
    { width: 375, height: 560 },
    { width: 1024, height: 640 },
    { width: 600, height: 500 },
  ]) {
    test(`${size.width}×${size.height}: while a look is held, its name, frame and buy button are on screen`, async ({
      page,
      isMobile,
    }) => {
      test.skip(isMobile, 'viewport sizes are set by the test');
      await page.setViewportSize(size);
      await gotoReady(page);
      // into the second look's stretch
      await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>('[data-spreads]')!;
        const a = document.querySelector<HTMLElement>('[data-spread]:not([hidden])')!;
        const run = s.offsetHeight - a.offsetHeight;
        window.scrollTo({ top: s.getBoundingClientRect().top + scrollY + run * 0.25, behavior: 'instant' });
      });
      await page.waitForTimeout(1800);
      const state = await essentialsOnScreen(page);
      if (state.held) {
        // held: everything a visitor needs to judge and buy the look is visible
        expect(state).toMatchObject({ name: true, frame: true, buy: true });
      } else {
        // not held: it must be because the fit guard (or the layout mode) made it a normal page
        expect(await page.locator('[data-spread]:not([hidden])').count()).toBe(1);
      }
    });
  }
});

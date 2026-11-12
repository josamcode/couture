import { expect, test } from '@playwright/test';
import { LOOKS, gotoReady, scrollToY, watchConsole } from './helpers';

test.describe('reduced motion', () => {
  test.use({ reducedMotion: 'reduce' });

  test('no WebGL canvas, no smooth scroll, and all content visible', async ({ page }) => {
    const problems = watchConsole(page);
    await gotoReady(page);
    await page.waitForTimeout(4000); // far longer than the WebGL effect needs to start

    const html = page.locator('html');
    await expect(html).not.toHaveClass(/\bmotion\b/);
    await expect(html).not.toHaveClass(/\blenis\b/); // no smooth scrolling
    await expect(page.locator('canvas')).toHaveCount(0); // no WebGL
    await expect(page.locator('.hero__ln')).toHaveCount(0); // no SplitText reveal
    // nothing is waiting to be revealed: reveal targets are at rest
    const waiting = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('[data-rise]')].filter((el) => {
        const cs = getComputedStyle(el);
        return cs.opacity !== '1' || (cs.transform !== 'none' && cs.transform !== 'matrix(1, 0, 0, 1, 0, 0)');
      }).length,
    );
    expect(waiting).toBe(0);

    // the hero section is one natural screen, not a tall pinned stage
    const stagePos = await page.locator('[data-hero-stage]').evaluate((el) => getComputedStyle(el).position);
    expect(stagePos).not.toBe('sticky');

    // everything is simply there
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('[data-plate-img]')).toBeVisible();
    for (const sel of ['#collection-title', '#look-editorial .spread__name', '#look-editorial [data-compare]']) {
      await page.locator(sel).scrollIntoViewIfNeeded();
      await expect(page.locator(sel)).toBeVisible();
    }
    await page.locator('#wardrobe-title').scrollIntoViewIfNeeded();
    await expect(page.locator('#wardrobe-title')).toBeVisible();
    await expect(page.locator('[data-wardrobe-card]')).toBeVisible();
    const opacities = await page.evaluate(() =>
      ['#wardrobe-title', '[data-wardrobe-card]', '#collection-title', 'h1'].map(
        (s) => getComputedStyle(document.querySelector(s)!).opacity,
      ),
    );
    expect(opacities).toEqual(['1', '1', '1', '1']);

    // the slider did not sweep on its own
    const value = await page.locator('#look-editorial [data-compare-range]').inputValue();
    expect(value).toBe('52');

    // switching looks still works, just without the transition
    await page.locator('button[data-look="noir"]').click();
    await expect(page.locator('#look-noir')).toBeVisible();
    await expect(page.locator('#look-editorial')).toBeHidden();

    expect(problems, problems.join('\n')).toEqual([]);
  });
});

test.describe('JavaScript disabled', () => {
  test.use({ javaScriptEnabled: false });

  test('all text and images are visible and in order', async ({ page }) => {
    await page.goto('/', { waitUntil: 'load' });

    // nothing is hidden for animation
    await expect(page.locator('html')).not.toHaveClass(/\bjs\b/);
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.locator('h1')).toHaveText(/AI makes off-the-rack\.\s*We make couture\./);
    await expect(page.getByText('Design skills, styles and prompts that give your AI a sense of taste.')).toBeVisible();
    await expect(page.locator('[data-plate-img]')).toBeVisible();
    await expect(page.getByRole('link', { name: 'Enter the collection' })).toBeVisible();

    // header is readable (not fixed over the ivory section) and its links work as plain anchors
    const headerPos = await page.locator('[data-header]').evaluate((el) => getComputedStyle(el).position);
    expect(headerPos).toBe('absolute');

    // every look is on the page, with its images, in order
    const tops: number[] = [];
    const y = async (sel: string) => (await page.locator(sel).boundingBox())!.y + (await page.evaluate(() => scrollY));
    tops.push(await y('h1'));
    tops.push(await y('#collection-title'));
    for (const look of LOOKS) {
      const spread = page.locator(`#look-${look.slug}`);
      await spread.scrollIntoViewIfNeeded();
      await expect(spread.locator('.spread__name')).toBeVisible();
      await expect(spread.locator('.spread__name')).toHaveText(look.name);
      await expect(spread.locator('a[data-checkout]')).toHaveText(`Acquire look ${look.numeral}`);
      await expect(spread.locator('.compare img')).toHaveCount(2);
      for (const img of await spread.locator('.compare img').all()) await expect(img).toBeVisible();
      tops.push(await y(`#look-${look.slug} .spread__name`));
    }
    await page.locator('#wardrobe-title').scrollIntoViewIfNeeded();
    await expect(page.locator('#wardrobe-title')).toBeVisible();
    await expect(page.locator('#wardrobe-title')).toHaveText(/Every AI has skills\.\s*Few have taste\./);
    await expect(page.getByRole('link', { name: 'Acquire the wardrobe' })).toBeVisible();
    tops.push(await y('#wardrobe-title'));
    tops.push(await y('footer'));
    expect(tops).toEqual([...tops].sort((a, b) => a - b));

    // the index is a list of working links instead of dead buttons
    await expect(page.locator('.look-index button')).toHaveCount(6);
    for (const b of await page.locator('.look-index button').all()) await expect(b).toBeHidden();
    await expect(page.locator('.look-index a[href="#look-noir"]')).toBeVisible();

    // images really loaded
    const broken = await page.evaluate(() =>
      [...document.images].filter((img) => !(img.complete && img.naturalWidth > 0)).map((img) => img.src),
    );
    expect(broken).toEqual([]);
  });
});

test.describe('WebGL', () => {
  test('when WebGL is unavailable the static image shows and nothing errors', async ({ page }) => {
    const problems = watchConsole(page);
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // force WebGL off
      HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...rest: unknown[]) {
        if (/webgl/i.test(type)) return null;
        return (original as (...a: unknown[]) => unknown).call(this, type, ...rest);
      } as typeof HTMLCanvasElement.prototype.getContext;
    });
    await gotoReady(page);
    await page.waitForTimeout(4500);

    await expect(page.locator('canvas')).toHaveCount(0);
    const img = page.locator('[data-plate-img]');
    await expect(img).toBeVisible();
    expect(await img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0)).toBe(true);

    // the page still scrolls and reads normally
    await scrollToY(page, 600);
    await expect(page.locator('h1')).toBeAttached();
    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('on a capable desktop the canvas mounts over the image, lazily', async ({ page, browserName, isMobile }) => {
    test.skip(browserName !== 'chromium' || isMobile, 'software WebGL is only configured for desktop Chromium');
    await gotoReady(page);
    const canvas = page.locator('canvas.plate__canvas.is-live');
    await expect(canvas).toHaveCount(1, { timeout: 15_000 });

    // OGL and the line-art texture are not part of the page load: both are requested only after the load event
    const timing = await page.evaluate(() => {
      const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
      const start = (re: RegExp) =>
        performance.getEntriesByType('resource').find((r) => re.test(r.name))?.startTime ?? -1;
      return {
        load: nav.loadEventStart,
        ogl: start(/painting\.[\w-]+\.js$/),
        lineart: start(/lineart-\d+\.webp$/),
      };
    });
    expect(timing.ogl).toBeGreaterThan(timing.load);
    expect(timing.lineart).toBeGreaterThan(timing.load);

    // Pixel ratio: what reaches the screen is capped at 2x. The buffer is sized for the close-up
    // (the plate is scaled up on scroll) and never exceeds 3x the plate's resting size.
    const ratio = await canvas.evaluate((c: HTMLCanvasElement) => {
      const plate = c.closest<HTMLElement>('[data-plate]')!;
      const grow = Math.max(1, Number(plate.dataset.maxScale) || 1);
      return { buffer: c.width / c.clientWidth, onScreenAtCloseUp: c.width / (c.clientWidth * grow) };
    });
    expect(ratio.buffer).toBeLessThanOrEqual(3.01);
    expect(ratio.buffer).toBeGreaterThan(0.2);
    expect(ratio.onScreenAtCloseUp).toBeLessThanOrEqual(2.01);

    // the image underneath is untouched (it is the fallback and the LCP element)
    await expect(page.locator('[data-plate-img]')).toBeVisible();
  });
});

import { expect, test } from '@playwright/test';
import { LOOKS, centre, gotoReady, scrollByY, scrollToY, settled, watchConsole } from './helpers';

test.describe('page', () => {
  test('loads and scrolls end to end with zero console errors or warnings', async ({ page }) => {
    const problems = watchConsole(page);
    await gotoReady(page);
    await page.waitForTimeout(2500); // headline reveal, lazy chunks, WebGL start

    // walk the whole page so every lazy image, trigger and transition runs
    const height = await page.evaluate(() => document.documentElement.scrollHeight);
    const step = Math.round((await page.evaluate(() => window.innerHeight)) * 0.6);
    for (let y = 0; y <= height; y += step) await scrollToY(page, y);
    await page.locator('button[data-look="soft-clay"]').scrollIntoViewIfNeeded();
    await page.locator('button[data-look="soft-clay"]').click();
    await expect(page.locator('#look-soft-clay')).toBeVisible();
    await page.waitForTimeout(1500);
    await scrollToY(page, 0);
    await page.waitForTimeout(500);

    expect(problems, problems.join('\n')).toEqual([]);
  });

  test('has the three sections, in order, and nothing else', async ({ page }) => {
    await gotoReady(page);
    const sections = page.locator('main > section');
    await expect(sections).toHaveCount(3);
    await expect(sections.nth(0)).toHaveAttribute('id', 'top');
    await expect(sections.nth(1)).toHaveAttribute('id', 'collection');
    await expect(sections.nth(2)).toHaveAttribute('id', 'wardrobe');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText(/AI makes off-the-rack\.\s*We make couture\./);
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('never scrolls sideways', async ({ page }) => {
    await gotoReady(page);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('every image has an alt attribute, and width/height to prevent layout shift', async ({ page }) => {
    await gotoReady(page);
    const bad = await page.evaluate(() =>
      [...document.images]
        .filter((img) => !img.hasAttribute('alt') || !img.getAttribute('width') || !img.getAttribute('height'))
        .map((img) => img.currentSrc || img.src),
    );
    expect(bad).toEqual([]);
    // content images describe themselves; only the decorative background drawing has an empty alt
    const emptyAlt = await page.evaluate(() =>
      [...document.images].filter((img) => img.alt === '').map((img) => !!img.closest('[aria-hidden="true"]')),
    );
    expect(emptyAlt.every(Boolean)).toBe(true);
  });

  test('red is only ever a mark: no readable text is set in red', async ({ page }) => {
    await gotoReady(page);
    const offenders = await page.evaluate(() => {
      const red = 'rgb(163, 18, 42)';
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
        const ownText = [...el.childNodes]
          .filter((n) => n.nodeType === Node.TEXT_NODE)
          .map((n) => n.textContent ?? '')
          .join('')
          .trim();
        if (!ownText) return;
        if (getComputedStyle(el).color === red && ownText !== '.') out.push(`${el.tagName} "${ownText.slice(0, 30)}"`);
      });
      return out;
    });
    expect(offenders).toEqual([]);
  });

  test('Bodoni Moda is never set below 24px', async ({ page }) => {
    await gotoReady(page);
    const small = await page.evaluate(() => {
      const out: string[] = [];
      document.querySelectorAll<HTMLElement>('body *').forEach((el) => {
        const hasText = [...el.childNodes].some((n) => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
        if (!hasText) return;
        const cs = getComputedStyle(el);
        if (cs.fontFamily.includes('Bodoni') && parseFloat(cs.fontSize) < 24) {
          out.push(`${el.className || el.tagName} ${cs.fontSize}`);
        }
      });
      return out;
    });
    expect(small).toEqual([]);
  });
});

test.describe('header', () => {
  test('links scroll to the right sections', async ({ page }) => {
    await gotoReady(page);
    const top = (sel: string) => page.evaluate((s) => document.querySelector(s)!.getBoundingClientRect().top, sel);

    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'The collection' }).click();
    await expect.poll(async () => Math.abs(await top('#collection')), { timeout: 12_000 }).toBeLessThan(4);
    await settled(page);

    // the header hides on the way down; scrolling up brings it back
    await scrollToY(page, 0);
    await expect(page.locator('[data-header]')).not.toHaveClass(/is-hidden/);
    await page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'The wardrobe' }).click();
    // the last section may be shorter than the screen on tall viewports: then the page just ends
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const t = Math.abs(document.querySelector('#wardrobe')!.getBoundingClientRect().top);
            const end = Math.abs(window.scrollY + window.innerHeight - document.documentElement.scrollHeight);
            return t < 4 || end < 4;
          }),
        { timeout: 12_000 },
      )
      .toBe(true);

    // wordmark goes back to the top
    await settled(page);
    await scrollByY(page, -300);
    await expect(page.locator('[data-header]')).not.toHaveClass(/is-hidden/);
    await page.getByRole('link', { name: /Couture UI, back to top/ }).click();
    await expect.poll(() => page.evaluate(() => window.scrollY), { timeout: 12_000 }).toBeLessThan(4);
  });

  test('Instagram link is correct', async ({ page }) => {
    await gotoReady(page);
    const link = page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Instagram' });
    await expect(link).toHaveAttribute('href', 'https://www.instagram.com/couture.ui/');
    await expect(page.locator('footer').getByRole('link', { name: '@couture.ui' })).toHaveAttribute(
      'href',
      'https://www.instagram.com/couture.ui/',
    );
  });

  test('hides on scroll down, returns on scroll up, turns ink over the ivory section', async ({ page }) => {
    await gotoReady(page);
    const header = page.locator('[data-header]');
    await expect(header).toHaveAttribute('data-tone', 'ink');

    // well inside the ivory section
    await centre(page, '#look-editorial [data-compare]');
    await scrollByY(page, 240);
    await expect(header).toHaveClass(/is-hidden/);
    await expect(header).toHaveAttribute('data-tone', 'ivory');

    await scrollByY(page, -160);
    await expect(header).not.toHaveClass(/is-hidden/);
    const color = await header.evaluate((el) => getComputedStyle(el).color);
    expect(color).toBe('rgb(11, 11, 12)'); // ink text on ivory
  });

  test('touch targets in the header are at least 44px tall', async ({ page }) => {
    await gotoReady(page);
    const sizes = await page.evaluate(() =>
      [...document.querySelectorAll('[data-header] a')].map((a) => Math.round(a.getBoundingClientRect().height)),
    );
    for (const h of sizes) expect(h).toBeGreaterThanOrEqual(44);
  });
});

test.describe('look index', () => {
  test('every look can be selected by click', async ({ page }) => {
    await gotoReady(page);
    await centre(page, '[data-look-index]');

    for (const look of LOOKS) {
      const btn = page.locator(`button[data-look="${look.slug}"]`);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();

      await expect(btn).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('button[data-look][aria-pressed="true"]')).toHaveCount(1);

      const spread = page.locator(`#look-${look.slug}`);
      await expect(spread).toBeVisible();
      await expect(page.locator('[data-spread]:not([hidden])')).toHaveCount(1, { timeout: 10_000 });
      await expect(spread.locator('.spread__name')).toHaveText(look.name);
      // the numeral in the buy button follows the active look
      const buy = spread.locator('a[data-checkout]');
      await expect(buy).toBeVisible();
      await expect(buy).toHaveText(`Acquire look ${look.numeral}`);
      await expect(buy).toHaveAttribute('data-checkout', `look-${look.slug}`);
      await expect(page.getByRole('link', { name: /^Acquire look / })).toHaveCount(1);
    }
  });

  test('arrow keys move between index items and select them', async ({ page }) => {
    await gotoReady(page);
    await centre(page, '[data-look-index]');
    const btn = (slug: string) => page.locator(`button[data-look="${slug}"]`);

    await expect(btn('editorial')).toBeVisible();
    await btn('editorial').focus();
    await page.keyboard.press('ArrowDown');
    await expect(btn('swiss-grid')).toBeFocused();
    await expect(btn('swiss-grid')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#look-swiss-grid')).toBeVisible();

    await page.keyboard.press('ArrowRight');
    await expect(btn('noir')).toBeFocused();
    await expect(btn('noir')).toHaveAttribute('aria-pressed', 'true');

    await page.keyboard.press('ArrowUp');
    await expect(btn('swiss-grid')).toBeFocused();

    await page.keyboard.press('End');
    await expect(btn('quiet-luxury')).toBeFocused();
    await expect(page.locator('#look-quiet-luxury')).toBeVisible();
    await expect(page.locator('#look-quiet-luxury a[data-checkout]')).toHaveText('Acquire look VI');

    await page.keyboard.press('ArrowDown'); // wraps
    await expect(btn('editorial')).toBeFocused();
    await expect(btn('editorial')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-spread]:not([hidden])')).toHaveCount(1, { timeout: 10_000 });
    await expect(page.locator('#look-editorial')).toBeVisible();
  });

  test('buy buttons carry data-checkout, point to "#", and do not move the page', async ({ page }) => {
    await gotoReady(page);
    const ids = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLAnchorElement>('a[data-checkout]')].map((a) => [
        a.dataset.checkout,
        a.getAttribute('href'),
      ]),
    );
    expect(ids).toEqual([...LOOKS.map((l) => [`look-${l.slug}`, '#']), ['wardrobe', '#']]);

    const buy = page.locator('#look-editorial a[data-checkout]');
    await centre(page, '#look-editorial a[data-checkout]');
    // Measure from the moment of the click itself (the test driver may nudge the page to bring the
    // button into view first; that is not the site moving).
    await page.evaluate(() => {
      window.addEventListener(
        'click',
        () => ((window as unknown as { __clickY: number }).__clickY = window.scrollY),
        { capture: true, once: true },
      );
    });
    // a real click at the button itself (locator.click() would first re-scroll the page, and in WebKit
    // that jumps a sticky element far enough to change which look is on show)
    const box = (await buy.boundingBox())!;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(700);
    expect(await page.evaluate(() => typeof (window as unknown as { __clickY?: number }).__clickY)).toBe('number');
    const moved = await page.evaluate(
      () => Math.abs(window.scrollY - (window as unknown as { __clickY: number }).__clickY),
    );
    expect(moved).toBeLessThan(2);
    expect(page.url()).not.toContain('#');
  });

  test('prices and numbers stay as placeholders (nothing invented)', async ({ page }) => {
    await gotoReady(page);
    await expect(page.locator('#look-editorial .spread__price')).toContainText('[YOUR PRICE]');
    await expect(page.locator('.card__price')).toContainText('[YOUR PRICE]');
    await expect(page.locator('#look-editorial .box')).toContainText('[NUMBER] prompts, tested on real briefs.');
  });
});

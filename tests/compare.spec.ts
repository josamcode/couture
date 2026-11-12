import { expect, test } from '@playwright/test';
import { centre, comparePos, gotoReady } from './helpers';

const FRAME = '#look-editorial [data-compare]';

test.describe('comparison slider', () => {
  test.beforeEach(async ({ page }) => {
    await gotoReady(page);
    await centre(page, FRAME);
    await page.waitForTimeout(700); // the frame finishes arriving (it tilts up as it scrolls in)
  });

  test('keyboard arrows move it and the clip matches the input value', async ({ page }) => {
    // (the divider's starting point depends on scroll position: scrolling "dresses" the page.
    //  The first key press hands control to the visitor, and it stays theirs.)
    const range = page.locator(`${FRAME} [data-compare-range]`);
    await range.focus();
    await page.keyboard.press('Home');
    let pos = await comparePos(page, 'editorial');
    expect(pos.value).toBe(0);
    expect(pos.clipLeft).toBe(0);

    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    pos = await comparePos(page, 'editorial');
    expect(pos.value).toBe(3);
    expect(pos.cssVar).toBe(3);
    expect(pos.clipLeft).toBe(3);
    expect(pos.valuetext).toBe('Divider at 3 percent');

    await page.keyboard.press('End');
    pos = await comparePos(page, 'editorial');
    expect(pos.value).toBe(100);
    expect(pos.clipLeft).toBe(100);

    for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
    pos = await comparePos(page, 'editorial');
    expect(pos.value).toBe(90);
    expect(pos.clipLeft).toBe(90);

    // it is the visitor's now: a little scrolling does not move it back
    await page.evaluate(() => window.scrollBy({ top: 60, behavior: 'instant' }));
    await page.waitForTimeout(500);
    expect((await comparePos(page, 'editorial')).value).toBe(90);
  });

  test('is a labelled native range input', async ({ page }) => {
    const range = page.getByRole('slider', { name: /Compare the Editorial look/ });
    await expect(range).toHaveCount(1);
    await expect(range).toHaveAttribute('type', 'range');
    await expect(range).toHaveAttribute('min', '0');
    await expect(range).toHaveAttribute('max', '100');
  });

  test('mouse drag moves it and the clip matches the input value', async ({ page }) => {
    const box = (await page.locator(FRAME).boundingBox())!;
    const y = box.y + box.height * 0.6;
    await page.mouse.move(box.x + box.width * 0.52, y);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.4, y, { steps: 6 });
    await page.mouse.move(box.x + box.width * 0.25, y, { steps: 6 });
    // while dragging, the picture follows the pointer (painted on the next animation frame)
    await expect
      .poll(async () => Math.abs((await comparePos(page, 'editorial')).clipLeft - 25), { timeout: 5_000 })
      .toBeLessThan(1.5);
    await page.mouse.up();

    const pos = await comparePos(page, 'editorial');
    expect(Math.abs(pos.value - 25)).toBeLessThanOrEqual(1);
    expect(pos.cssVar).toBe(pos.value);
    expect(pos.clipLeft).toBe(pos.value);

    // dragging past the edge clamps
    await page.mouse.move(box.x + box.width * 0.25, y);
    await page.mouse.down();
    // (stay inside the window: browsers do not deliver mouse events outside it in automation)
    const vw = page.viewportSize()!.width;
    await page.mouse.move(Math.min(box.x + box.width + 80, vw - 2), y, { steps: 8 });
    await page.mouse.move(Math.min(box.x + box.width + 80, vw - 2), y - 1);
    await page.mouse.up();
    expect((await comparePos(page, 'editorial')).value).toBeGreaterThanOrEqual(99);
  });

  test('labels are in the top corners', async ({ page }) => {
    const frame = page.locator(FRAME);
    await expect(frame.locator('.compare__label--l')).toHaveText('Off-the-rack');
    await expect(frame.locator('.compare__label--r')).toHaveText('Couture');
    const box = (await frame.boundingBox())!;
    const l = (await frame.locator('.compare__label--l').boundingBox())!;
    expect(l.x - box.x).toBeLessThan(24);
    expect(l.y - box.y).toBeLessThan(24);
  });

  test('handle is a 44px round target', async ({ page }) => {
    const size = await page
      .locator(`${FRAME} .compare__handle`)
      // layout size (the frame may be turned slightly in 3D, which would skew a bounding box)
      .evaluate((el: HTMLElement) => [el.offsetWidth, el.offsetHeight]);
    expect(Math.round(size[0])).toBe(44);
    expect(Math.round(size[1])).toBe(44);
  });
});

test.describe('comparison slider · touch', () => {
  // Real touch input through the Chrome DevTools Protocol (Chromium mobile emulation only).
  test.skip(({ browserName, isMobile }) => browserName !== 'chromium' || !isMobile, 'needs Chromium touch emulation');

  test('horizontal touch drag moves the divider and does not scroll the page', async ({ page }) => {
    await gotoReady(page);
    await centre(page, FRAME);
    await page.waitForTimeout(1200); // let the scroll-driven divider settle
    const cdp = await page.context().newCDPSession(page);
    const box = (await page.locator(FRAME).boundingBox())!;
    const y = Math.round(box.y + box.height * 0.6);
    const x0 = Math.round(box.x + box.width * 0.52);
    const x1 = Math.round(box.x + box.width * 0.8);
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0, y }] });
    for (let i = 1; i <= 12; i++) {
      const x = Math.round(x0 + ((x1 - x0) * i) / 12);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: y + (i % 2) }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(150);

    const pos = await comparePos(page, 'editorial');
    expect(Math.abs(pos.value - 80)).toBeLessThanOrEqual(2);
    expect(pos.clipLeft).toBe(pos.value);
    expect(Math.abs((await page.evaluate(() => window.scrollY)) - scrollBefore)).toBeLessThan(2);
  });

  test('vertical swipe on the frame scrolls the page and leaves the divider alone', async ({ page }) => {
    await gotoReady(page);
    await centre(page, FRAME);
    await page.waitForTimeout(1200);
    // take the divider over first (scrolling moves it on its own until the visitor has touched it)
    await page.locator(`${FRAME} [data-compare-range]`).focus();
    await page.keyboard.press('ArrowLeft');
    const cdp = await page.context().newCDPSession(page);
    const box = (await page.locator(FRAME).boundingBox())!;
    const x = Math.round(box.x + box.width * 0.3);
    const y0 = Math.round(box.y + box.height * 0.7);
    const before = await comparePos(page, 'editorial');
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: y0 }] });
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + (i % 2), y: y0 - i * 14 }] });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(400);

    expect((await page.evaluate(() => window.scrollY)) - scrollBefore).toBeGreaterThan(60);
    expect((await comparePos(page, 'editorial')).value).toBe(before.value);
  });
});

import { expect, type ConsoleMessage, type Page } from '@playwright/test';

export const LOOKS = [
  { slug: 'editorial', numeral: 'I', name: 'Editorial' },
  { slug: 'swiss-grid', numeral: 'II', name: 'Swiss grid' },
  { slug: 'noir', numeral: 'III', name: 'Noir' },
  { slug: 'brutal-mono', numeral: 'IV', name: 'Brutal mono' },
  { slug: 'soft-clay', numeral: 'V', name: 'Soft clay' },
  { slug: 'quiet-luxury', numeral: 'VI', name: 'Quiet luxury' },
] as const;

/**
 * Console noise that is produced by the TEST BROWSER, not by the site:
 * headless Chromium renders WebGL in software and its GL driver logs a performance note
 * whenever Playwright reads the canvas back. Real browsers with a GPU never print it.
 */
const BROWSER_NOISE = [/GL Driver Message .*GPU stall due to ReadPixels/];

/** Collect every console error/warning and uncaught exception from the page. */
export function watchConsole(page: Page, alsoIgnore: RegExp[] = []) {
  const problems: string[] = [];
  page.on('console', (msg: ConsoleMessage) => {
    if (msg.type() !== 'error' && msg.type() !== 'warning') return;
    const text = msg.text();
    if ([...BROWSER_NOISE, ...alsoIgnore].some((re) => re.test(text))) return;
    problems.push(`[${msg.type()}] ${text}`);
  });
  page.on('pageerror', (err) => problems.push(`[pageerror] ${err.message}`));
  page.on('requestfailed', (req) => problems.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`));
  return problems;
}

/** Load the page and wait until fonts are in and the lazy scroll module has started. */
export async function gotoReady(page: Page, path = '/') {
  await page.goto(path, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.documentElement.classList.contains('scroll-ready'), null, {
    timeout: 15_000,
  });
}

export async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: 'instant' }), Math.round(y));
  await page.waitForTimeout(250);
}

/** Scroll so that an element sits in the middle of the viewport, without smooth scrolling. */
export async function centre(page: Page, selector: string) {
  await page.evaluate((sel) => {
    const el = document.querySelector(sel)!;
    const r = el.getBoundingClientRect();
    window.scrollTo({ top: r.top + window.scrollY - (window.innerHeight - r.height) / 2, behavior: 'instant' });
  }, selector);
  await page.waitForTimeout(350);
}

/** Wait until the page has stopped moving (smooth scroll finished). */
export async function settled(page: Page) {
  // still for half a second, sampled several times (a slow machine can make smooth scrolling look
  // finished between two frames when it is not)
  await expect
    .poll(
      async () => {
        const ys: number[] = [];
        for (let i = 0; i < 4; i++) {
          ys.push(await page.evaluate(() => window.scrollY));
          await page.waitForTimeout(170);
        }
        return Math.max(...ys) - Math.min(...ys);
      },
      { timeout: 15_000 },
    )
    .toBeLessThan(0.5);
}

export const comparePos = (page: Page, slug: string) =>
  page.evaluate((s) => {
    const frame = document.querySelector<HTMLElement>(`#look-${s} [data-compare]`)!;
    const range = frame.querySelector<HTMLInputElement>('[data-compare-range]')!;
    const top = frame.querySelector<HTMLElement>('.compare__layer--top')!;
    const clip = getComputedStyle(top).clipPath; // e.g. "inset(0px 0px 0px 25%)"
    const m = clip.match(/inset\((?:[^ ]+ ){3}([\d.]+)%\)/);
    return {
      value: Number(range.value),
      cssVar: Number(getComputedStyle(frame).getPropertyValue('--pos')),
      clipLeft: m ? Number(m[1]) : NaN,
      valuetext: range.getAttribute('aria-valuetext'),
    };
  }, slug);

/** Scroll by a relative amount the way a user would (works in every engine, including mobile WebKit). */
export async function scrollByY(page: Page, dy: number) {
  const steps = 6;
  for (let i = 0; i < steps; i++) {
    await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'instant' }), dy / steps);
    await page.waitForTimeout(40);
  }
  await page.waitForTimeout(200);
}

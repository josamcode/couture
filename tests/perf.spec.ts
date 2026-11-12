// Scroll performance gate: record a Chrome trace while scrolling the whole page and fail if the
// renderer's main thread ever runs a task longer than 50 ms.
//   npm run test:perf        → summaries are written to qa/perf/
import { expect, test, type Browser, type Page } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const LONG_TASK_US = 50_000;
const OUT = path.resolve('qa/perf');

interface TraceEvent {
  name: string;
  ph: string;
  pid: number;
  tid: number;
  ts: number;
  dur?: number;
  args?: { name?: string; data?: { frames?: { processId: number }[] } };
}

/** Record a trace around `scroll()` and summarise the main-thread tasks of the page's renderer. */
async function traceScroll(browser: Browser, page: Page, name: string, scroll: () => Promise<void>) {
  await browser.startTracing(page, {
    categories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', '__metadata'],
  });
  await page.waitForTimeout(300); // let the tracing start-up noise pass
  const t0 = await page.evaluate(() => performance.now());
  await scroll();
  const t1 = await page.evaluate(() => performance.now());
  const buffer = await browser.stopTracing();

  const events: TraceEvent[] = JSON.parse(buffer.toString('utf8')).traceEvents;
  // the page's renderer process, then its main thread
  const started = events.find((e) => e.name === 'TracingStartedInBrowser');
  const pid = started?.args?.data?.frames?.[0]?.processId;
  const main = events.find((e) => e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain');
  expect(pid, 'renderer process found in trace').toBeTruthy();
  expect(main, 'renderer main thread found in trace').toBeTruthy();

  const tasks = events.filter(
    (e) => e.pid === pid && e.tid === main!.tid && e.ph === 'X' && e.name === 'RunTask' && typeof e.dur === 'number',
  );
  // ignore the first and last 250 ms of the recording (tracing start / stop, not the site)
  const first = Math.min(...tasks.map((t) => t.ts));
  const last = Math.max(...tasks.map((t) => t.ts));
  const inWindow = tasks.filter((t) => t.ts > first + 250_000 && t.ts < last - 250_000);
  const long = inWindow.filter((t) => t.dur! > LONG_TASK_US);
  const durations = inWindow.map((t) => t.dur! / 1000).sort((a, b) => a - b);
  const pct = (p: number) => durations[Math.min(durations.length - 1, Math.floor(durations.length * p))] ?? 0;

  const summary = {
    scenario: name,
    recordedAt: new Date().toISOString(),
    scrollDurationMs: Math.round(t1 - t0),
    mainThreadTasks: inWindow.length,
    longTasksOver50ms: long.length,
    longestTaskMs: Number((durations[durations.length - 1] ?? 0).toFixed(1)),
    p99TaskMs: Number(pct(0.99).toFixed(1)),
    p95TaskMs: Number(pct(0.95).toFixed(1)),
    tasksOver16ms: durations.filter((d) => d > 16).length,
    longTasks: long.map((t) => ({
      atMs: Math.round((t.ts - first) / 1000),
      durMs: Number((t.dur! / 1000).toFixed(1)),
      // what the task was doing: its biggest pieces
      work: events
        .filter(
          (e) =>
            e.pid === pid && e.tid === main!.tid && e.ph === 'X' && e !== t && e.name !== 'RunTask' &&
            e.ts >= t.ts && e.ts + (e.dur ?? 0) <= t.ts + t.dur! && (e.dur ?? 0) > 3000,
        )
        .sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0))
        .slice(0, 6)
        .map((e) => `${e.name} ${((e.dur ?? 0) / 1000).toFixed(0)}ms`),
    })),
  };
  mkdirSync(OUT, { recursive: true });
  writeFileSync(path.join(OUT, `scroll-trace-${name}.json`), JSON.stringify(summary, null, 2) + '\n');
  console.log(
    `[${name}] ${summary.mainThreadTasks} tasks · longest ${summary.longestTaskMs} ms · p99 ${summary.p99TaskMs} ms · >50ms: ${summary.longTasksOver50ms}`,
  );
  return summary;
}

async function ready(page: Page) {
  await page.goto('/', { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForFunction(() => document.documentElement.classList.contains('scroll-ready'));
  // intro finished and the WebGL warm-up done (it starts on first movement, or after ~5 idle seconds):
  // this test measures scrolling, not start-up
  await page.mouse.move(300, 300);
  await page.waitForTimeout(8000);
}

// the page is long (three pinned scenes): give the recordings room
test.describe.configure({ timeout: 240_000 });

test('desktop: no long tasks while wheel-scrolling the whole page (down and back up)', async ({ page, browser }) => {
  await ready(page);
  await page.mouse.move(720, 450);
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const summary = await traceScroll(browser, page, 'desktop', async () => {
    for (let y = 0; y < height; y += 150) {
      await page.mouse.wheel(0, 150);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(700);
    for (let y = 0; y < height; y += 300) {
      await page.mouse.wheel(0, -300);
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(700);
  });
  expect(summary.longTasks, JSON.stringify(summary.longTasks)).toEqual([]);
});

test('phone: no long tasks while touch-scrolling the whole page (4× CPU throttle)', async ({ browser }) => {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await ready(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 }); // a mid-range phone

  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  const swipe = (distance: number) =>
    cdp.send('Input.synthesizeScrollGesture', {
      x: 200,
      y: 500,
      yDistance: distance,
      speed: 1400,
      gestureSourceType: 'touch',
      repeatCount: 1,
    });
  const summary = await traceScroll(browser, page, 'phone-4x-cpu', async () => {
    for (let y = 0; y < height; y += 600) await swipe(-600);
    await page.waitForTimeout(500);
    for (let y = 0; y < height; y += 900) await swipe(900);
    await page.waitForTimeout(500);
  });
  await context.close();
  expect(summary.longTasks, JSON.stringify(summary.longTasks)).toEqual([]);
});

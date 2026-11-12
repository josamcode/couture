// WebGL start-up on a real GPU.
//
// The other scroll recordings run in headless Chromium, where WebGL is rendered in software, and they
// start after the effect has warmed up. This one answers a different question: on a machine with a
// GPU, what happens to the main thread when the visitor's FIRST scroll wakes the effect up
// (OGL import, shader compile, texture upload, first frame) while the hero scene is already moving?
//
// It needs a real GPU and a visible window, so it only runs when asked for:
//   npm run test:gpu          (sets GPU=1; a browser window opens for a few seconds)
import { chromium, expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

test.skip(!process.env.GPU, 'run with GPU=1 on a machine with a real GPU (opens a browser window)');
test.describe.configure({ timeout: 120_000 });

test('first scroll: WebGL start-up does not block the main thread for more than 50 ms', async ({ baseURL }) => {
  const browser = await chromium.launch({
    headless: false,
    // off to the side, so the real mouse cannot wander over the window and count as the first interaction
    args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization', '--window-size=1440,1000', '--window-position=-2400,60'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await page.goto(baseURL!, { waitUntil: 'load' });
  await page.waitForFunction(() => document.documentElement.classList.contains('scroll-ready'));
  await page.waitForTimeout(600); // well before the 5 s idle warm-up: the scroll below is the first movement

  const gpu = await page.evaluate(() => {
    const gl = document.createElement('canvas').getContext('webgl2');
    const info = gl?.getExtension('WEBGL_debug_renderer_info');
    return {
      renderer: gl && info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown',
      parallelCompile: !!gl?.getExtension('KHR_parallel_shader_compile'),
      canvasBefore: document.querySelectorAll('canvas').length,
    };
  });
  expect(gpu.canvasBefore, 'the effect must not have started before the first interaction').toBe(0);
  test.skip(/swiftshader|software|llvmpipe/i.test(gpu.renderer), `no hardware GPU here (${gpu.renderer})`);

  await browser.startTracing(page, {
    categories: ['toplevel', 'devtools.timeline', 'disabled-by-default-devtools.timeline', '__metadata'],
  });
  await page.waitForTimeout(700); // let the tracing start-up noise pass BEFORE the first interaction
  // mark the moment of the first interaction inside the trace itself
  await page.evaluate(() => console.timeStamp('first-interaction'));
  await page.mouse.move(720, 450);
  // scroll straight into the hero scene: the painting is growing while WebGL wakes up
  for (let i = 0; i < 60; i++) {
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(16);
  }
  await page.waitForFunction(() => !!document.querySelector('canvas.plate__canvas.is-live'), null, { timeout: 20_000 });
  await page.waitForTimeout(1200);
  const workerCount = page.workers().length;
  const buffer = await browser.stopTracing();
  await browser.close();

  interface Ev {
    name: string;
    ph: string;
    pid: number;
    tid: number;
    ts: number;
    dur?: number;
    args?: { name?: string; data?: { frames?: { processId: number }[] } };
  }
  const events: Ev[] = JSON.parse(buffer.toString('utf8')).traceEvents;
  const pid = events.find((e) => e.name === 'TracingStartedInBrowser')?.args?.data?.frames?.[0]?.processId;
  const main = events.find((e) => e.name === 'thread_name' && e.pid === pid && e.args?.name === 'CrRendererMain');
  const tasks = events.filter(
    (e) => e.pid === pid && e.tid === main?.tid && e.ph === 'X' && e.name === 'RunTask' && typeof e.dur === 'number',
  );
  // The window is everything from the first interaction on (any task that overlaps it counts),
  // minus the last 250 ms where the recording is being stopped.
  const mark = events.find((e) => e.name === 'TimeStamp' && e.pid === pid);
  expect(pid, 'renderer process found in the trace').toBeTruthy();
  expect(main, 'renderer main thread found in the trace').toBeTruthy();
  expect(mark, 'first-interaction mark found in the trace').toBeTruthy();
  const last = Math.max(...tasks.map((t) => t.ts));
  const inWindow = tasks.filter((t) => t.ts + t.dur! >= mark!.ts && t.ts < last - 250_000);
  expect(inWindow.length, 'the recording contains main-thread work').toBeGreaterThan(200);
  expect(workerCount, 'the effect runs in a worker').toBe(1);
  const durations = inWindow.map((t) => t.dur! / 1000).sort((a, b) => a - b);
  const long = inWindow
    .filter((t) => t.dur! > 50_000)
    .map((t) => ({
      atMsAfterInteraction: Math.round((t.ts - mark!.ts) / 1000),
      durMs: Number((t.dur! / 1000).toFixed(1)),
      // what the task was doing: its biggest pieces
      work: events
        .filter(
          (e) =>
            e.pid === pid && e.tid === main!.tid && e.ph === 'X' && e !== t && e.name !== 'RunTask' &&
            e.ts >= t.ts && e.ts + (e.dur ?? 0) <= t.ts + t.dur! && (e.dur ?? 0) > 3000,
        )
        .sort((a, b) => (b.dur ?? 0) - (a.dur ?? 0))
        .slice(0, 8)
        .map((e) => `${e.name} ${((e.dur ?? 0) / 1000).toFixed(0)}ms`),
    }));

  const summary = {
    scenario: 'first-scroll-webgl-startup (real GPU, headed)',
    recordedAt: new Date().toISOString(),
    gpu: gpu.renderer,
    parallelShaderCompile: gpu.parallelCompile,
    mainThreadTasks: inWindow.length,
    longestTaskMs: Number((durations[durations.length - 1] ?? 0).toFixed(1)),
    p99TaskMs: Number((durations[Math.floor(durations.length * 0.99)] ?? 0).toFixed(1)),
    longTasksOver50ms: long,
    gpuWorkOnMainThread: false,
  };
  mkdirSync(path.resolve('qa/perf'), { recursive: true });
  writeFileSync(path.resolve('qa/perf/webgl-startup-gpu.json'), JSON.stringify(summary, null, 2) + '\n');
  console.log(`[gpu] ${summary.gpu} · longest ${summary.longestTaskMs} ms · p99 ${summary.p99TaskMs} ms · >50ms: ${long.length}`);
  expect(long, JSON.stringify(summary)).toEqual([]);
});

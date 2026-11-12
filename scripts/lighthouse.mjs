// Runs Lighthouse CI on the built dist/ twice (mobile and desktop, 3 runs each), asserts the budgets
// in lighthouserc.cjs, and saves the reports to qa/lighthouse/<preset>/.
//   npm run build && npm run lhci
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';

if (!existsSync('dist/index.html')) {
  console.error('dist/ is missing. Run `npm run build` first.');
  process.exit(1);
}

const only = process.argv[2];
const presets = ['mobile', 'desktop'].filter((p) => !only || p === only);
const summary = {};
let failed = false;

for (const preset of presets) {
  const outDir = path.join('qa/lighthouse', preset);
  rmSync(outDir, { recursive: true, force: true });
  rmSync('.lighthouseci', { recursive: true, force: true });
  console.log(`\n=== Lighthouse CI · ${preset} ===`);
  const res = spawnSync('npx', ['lhci', 'autorun', '--config=lighthouserc.cjs'], {
    stdio: 'inherit',
    shell: true,
    env: {
      ...process.env,
      LH_PRESET: preset,
      // use the same Chromium the tests use, so results do not depend on what is installed
      CHROME_PATH: process.env.CHROME_PATH || chromium.executablePath(),
    },
  });
  if (res.status !== 0) failed = true;

  const manifestPath = path.join(outDir, 'manifest.json');
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const runs = manifest.map((run) => {
      const lhr = JSON.parse(readFileSync(run.jsonPath, 'utf8'));
      const a = lhr.audits;
      return {
        representative: run.isRepresentativeRun,
        performance: Math.round(lhr.categories.performance.score * 100),
        accessibility: Math.round(lhr.categories.accessibility.score * 100),
        bestPractices: Math.round(lhr.categories['best-practices'].score * 100),
        seo: Math.round(lhr.categories.seo.score * 100),
        fcpMs: Math.round(a['first-contentful-paint'].numericValue),
        lcpMs: Math.round(a['largest-contentful-paint'].numericValue),
        tbtMs: Math.round(a['total-blocking-time'].numericValue),
        cls: Number(a['cumulative-layout-shift'].numericValue.toFixed(4)),
        speedIndexMs: Math.round(a['speed-index'].numericValue),
        lcpElement: a['largest-contentful-paint-element']?.details?.items?.[0]?.items?.[0]?.node?.snippet?.slice(0, 90),
        report: path.basename(run.htmlPath),
      };
    });
    summary[preset] = { passedAssertions: res.status === 0, median: runs.find((r) => r.representative) ?? runs[0], runs };
  }
}

writeFileSync('qa/lighthouse/summary.json', JSON.stringify(summary, null, 2) + '\n');
console.log('\n=== Summary (median run) ===');
for (const [preset, s] of Object.entries(summary)) {
  const m = s.median;
  console.log(
    `${preset.padEnd(8)} perf ${m.performance} · a11y ${m.accessibility} · best ${m.bestPractices} · seo ${m.seo} · ` +
      `LCP ${m.lcpMs} ms · TBT ${m.tbtMs} ms · CLS ${m.cls} · ${s.passedAssertions ? 'PASS' : 'FAIL'}`,
  );
}
console.log('reports → qa/lighthouse/');
process.exit(failed ? 1 : 0);

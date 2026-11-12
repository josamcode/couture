// Lighthouse CI: the performance budget from the brief, as assertions.
// Run with `npm run lhci` (scripts/lighthouse.mjs), which runs this twice: LH_PRESET=mobile and LH_PRESET=desktop.
// Do not lower a number here to make a run pass. Fix the cause.
const preset = process.env.LH_PRESET === 'desktop' ? 'desktop' : 'mobile';
const PORT = 4322;

module.exports = {
  ci: {
    collect: {
      url: [`http://localhost:${PORT}/`],
      numberOfRuns: 3,
      // serves dist/ with the same headers and compression as production (public/_headers)
      startServerCommand: `node scripts/serve.mjs ${PORT}`,
      startServerReadyPattern: 'serving dist',
      settings: {
        ...(preset === 'desktop' ? { preset: 'desktop' } : {}), // default = mobile emulation, slow 4G, 4× CPU
        // software WebGL on, so the painting effect really runs during the audit (the honest worst case)
        chromeFlags: '--headless=new --enable-unsafe-swiftshader --ignore-gpu-blocklist',
      },
    },
    assert: {
      aggregationMethod: 'median-run',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
        'largest-contentful-paint': ['error', { maxNumericValue: 2500 }],
        'cumulative-layout-shift': ['error', { maxNumericValue: 0.1 }],
        'total-blocking-time': ['error', { maxNumericValue: 200 }],
      },
    },
    upload: {
      target: 'filesystem',
      outputDir: `qa/lighthouse/${preset}`,
      reportFilenamePattern: `%%DATETIME%%-${preset}.%%EXTENSION%%`,
    },
  },
};

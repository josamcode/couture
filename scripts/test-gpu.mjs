// Runs the real-GPU WebGL start-up recording (tests/perf-gpu.spec.ts). A browser window opens briefly.
import { spawnSync } from 'node:child_process';
const res = spawnSync('npx', ['playwright', 'test', 'tests/perf-gpu.spec.ts', '--project=perf', '--reporter=line'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, GPU: '1' },
});
process.exit(res.status ?? 1);

// `npm run preview` dan oldin ishga tushadi:
// client/dist yo'q bo'lsa — VITE_API_URL='' (same-origin) bilan build qiladi.
// Shunda preview server har doim ishlaydigan build beradi.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const clientDir = path.join(__dirname, '..', 'client');
const distIndex = path.join(clientDir, 'dist', 'index.html');

if (!fs.existsSync(distIndex)) {
  console.log('[preview] client/dist topilmadi — build qilinmoqda (VITE_API_URL=, same-origin) ...');
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const r = spawnSync(npmCmd, ['run', 'build'], {
    cwd: clientDir,
    env: { ...process.env, VITE_API_URL: '' },
    stdio: 'inherit',
  });
  if (r.status !== 0) {
    console.error('[preview] Client build xatosi — preview server ishga tushmaydi.');
    process.exit(r.status ?? 1);
  }
}

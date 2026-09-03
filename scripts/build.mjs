/**
 * Production build (root).
 *
 * NIMA UCHUN KERAK:
 *   Loyiha monorepo: client alohida papkada (client/dist), lekin CI/CD
 *   (masalan Cloudflare Workers Builds) root'da `npm run build` chaqiradi va
 *   natijani `./dist` ichida kutadi. Shuning uchun client qurilgach, natija
 *   root'dagi `dist/` papkasiga ham ko'chiriladi.
 *
 *   Root'da package.json bo'lmaganda CI avto-aniqlash client papkasini topardi;
 *   monorepo root package.json qo'shilgandan keyin ildiz o'zgardi va build
 *   "output directory not found" bilan yiqila boshladi — shu skript hal qiladi.
 */
import { cpSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, 'client', 'dist');
const mirrorDir = path.join(root, 'dist');

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const r = spawnSync(npm, ['--prefix', path.join(root, 'client'), 'run', 'build'], {
  stdio: 'inherit',
  cwd: root,
  shell: process.platform === 'win32',
});
if (r.status !== 0) process.exit(r.status ?? 1);

if (!existsSync(outDir)) {
  console.error(`Kutilmagan holat: ${outDir} topilmadi`);
  process.exit(1);
}
rmSync(mirrorDir, { recursive: true, force: true });
cpSync(outDir, mirrorDir, { recursive: true });
console.log(`Build tayyor: ${path.relative(root, outDir)} -> ${path.relative(root, mirrorDir)}`);

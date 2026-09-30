import { cpSync, mkdirSync } from 'node:fs';
// Keep generated modules at stable URLs for local owner sync and the next deploy baseline.
mkdirSync('dist/src/data', { recursive: true });
for (const game of ['endfield', 'wuwa', 'zzz', 'genshin', 'hsr']) {
  cpSync(`src/data/${game}.generated.js`, `dist/src/data/${game}.generated.js`);
}
cpSync('assets', 'dist/assets', { recursive: true });
for (const file of ['CNAME', 'LICENSE']) cpSync(file, `dist/${file}`);

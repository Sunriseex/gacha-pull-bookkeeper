import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const parseGenerated = (text) => {
  const patches = text.match(/export const GENERATED_PATCHES\s*=\s*(\[[\s\S]*?\]);/);
  const meta = text.match(/export const GENERATED_PATCHES_META\s*=\s*(\{[\s\S]*?\});/);
  if (!patches || !meta) throw new Error('Invalid generated module');
  const rows = JSON.parse(patches[1]);
  const metadata = JSON.parse(meta[1]);
  const timestamp = Date.parse(metadata.generatedAt);
  if (!Array.isArray(rows) || rows.length === 0 || !Number.isFinite(timestamp)) {
    throw new Error('Empty patches or invalid generation timestamp');
  }
  return { timestamp, gameId: metadata.gameId };
};

export const selectLatestGenerated = (working, published) => {
  const a = parseGenerated(working);
  const b = parseGenerated(published);
  if (!a.gameId || a.gameId !== b.gameId) throw new Error('Generated game ID mismatch');
  return b.timestamp >= a.timestamp ? published : working;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  for (const game of ['endfield', 'wuwa', 'zzz', 'genshin', 'hsr']) {
    const path = `src/data/${game}.generated.js`;
    const working = readFileSync(path, 'utf8');
    // Fail closed if the deployment baseline cannot be read.
    const published = execFileSync('git', ['show', `origin/github-pages:${path}`], { encoding: 'utf8' });
    writeFileSync(path, selectLatestGenerated(working, published));
  }
}

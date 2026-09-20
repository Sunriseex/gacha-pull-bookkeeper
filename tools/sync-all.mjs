import { spawnSync } from 'node:child_process';
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const games = ['arknights-endfield', 'wuthering-waves', 'zenless-zone-zero', 'genshin-impact', 'honkai-star-rail'];

// Inspect every source, but keep publication all-or-nothing. Never retry a
// parser error or turn it into a successful run with silently stale data.
export const syncAll = (run) => games.map((game) => {
  try {
    const result = run(game);
    return { game, ok: result.status === 0 && !result.error && !result.signal,
      log: [result.stdout, result.stderr, result.error?.message, result.signal && `Signal: ${result.signal}`].filter(Boolean).join('\n') };
  } catch (error) {
    return { game, ok: false, log: String(error) };
  }
});

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const binary = process.argv[2];
  if (!binary) throw new Error('Usage: node tools/sync-all.mjs /path/to/patchsync');
  mkdirSync('sync-logs', { recursive: true });
  const results = syncAll((game) => spawnSync(binary, ['--game', game], {
    encoding: 'utf8', timeout: 10 * 60 * 1000, maxBuffer: 8 * 1024 * 1024,
  }));
  for (const result of results) {
    writeFileSync(`sync-logs/${result.game}.log`, result.log);
    console.log(`${result.game}: ${result.ok ? 'OK' : 'FAILED'}\n${result.log}`);
  }
  const summary = ['## Sheet synchronization', '', '| Game | Result |', '| --- | --- |',
    ...results.map(({ game, ok, log }) => `| ${game} | ${ok ? (/WARNING:|defer new WIP patch/.test(log) ? 'OK (see diagnostics)' : 'OK') : 'FAILED'} |`), '',
    results.every(({ ok }) => ok) ? 'All sources refreshed; catalog validation follows.' : 'Publication blocked. The previously published site is unchanged.', ''].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  process.exitCode = results.every(({ ok }) => ok) ? 0 : 1;
}

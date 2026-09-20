import test from 'node:test';
import assert from 'node:assert/strict';
import { games, syncAll } from '../tools/sync-all.mjs';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

test('a failed first source does not hide failures or results of later games', () => {
  const called = [];
  const results = syncAll((game) => {
    called.push(game);
    return { status: game === games[0] ? 1 : 0, stderr: 'source diagnostics' };
  });
  assert.deepEqual(called, games);
  assert.deepEqual(results.map(({ ok }) => ok), [false, true, true, true, true]);
  assert.equal(results.every(({ ok }) => ok), false);
  assert.equal(results[0].log, 'source diagnostics');
});

test('timeout, signal and runner exceptions block publication; all-success permits validation', () => {
  for (const run of [() => ({status: null, error: new Error('timeout')}),
    () => ({status: null, signal: 'SIGTERM'}), () => { throw new Error('spawn failed'); }]) {
    const results = syncAll(run);
    assert.equal(results.length, games.length);
    assert.ok(results.every(({ ok, log }) => !ok && log.length > 0));
  }
  assert.ok(syncAll(() => ({status: 0})).every(({ ok }) => ok));
});

test('CLI exits nonzero on partial failure and persists every log and the summary', { skip: process.platform === 'win32' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'sync-all-'));
  try {
    const binary = join(dir, 'fake patchsync');
    writeFileSync(binary, '#!/bin/sh\necho "checked $2"\n[ "$2" != "arknights-endfield" ]\n', { mode: 0o755 });
    const summary = join(dir, 'summary.md');
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../tools/sync-all.mjs', import.meta.url)), binary], {
      cwd: dir, encoding: 'utf8', env: { ...process.env, GITHUB_STEP_SUMMARY: summary },
    });
    assert.equal(result.status, 1, result.stderr);
    assert.equal(readdirSync(join(dir, 'sync-logs')).length, games.length);
    const text = readFileSync(summary, 'utf8');
    assert.match(text, /Publication blocked/);
    assert.match(text, /honkai-star-rail \| OK/);
    assert.match(text, /arknights-endfield \| FAILED/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { selectLatestGenerated } from '../tools/prepare-publish.mjs';
const moduleText = (date, gameId = 'test') => `export const GENERATED_PATCHES = [{"id":"1.0"}];\nexport const GENERATED_PATCHES_META = ${JSON.stringify({ generatedAt:date, gameId })};`;

test('deploy retains published data newer than master', () => {
  const old = moduleText('2026-06-30');
  const current = moduleText('2026-09-01');
  assert.equal(selectLatestGenerated(old, current), current);
  assert.equal(selectLatestGenerated(current, old), current);
});

test('invalid baseline stops deployment instead of reverting data', () => {
  assert.throws(() => selectLatestGenerated(moduleText('2026-09-01'), 'broken'));
  assert.throws(() => selectLatestGenerated(moduleText('2026-09-01'), moduleText('invalid')));
  assert.throws(() => selectLatestGenerated(moduleText('2026-09-01'), moduleText('2026-09-01', 'another')));
});

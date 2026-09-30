import test from 'node:test';
import assert from 'node:assert/strict';
import { selectPatchRange } from '../src/domain/patch-range.js';
import { readPatchRange } from '../src/lib/preferences.js';
import { GAME_CATALOG } from '../src/data/patches.js';
import { aggregateTotals } from '../src/domain/calculation.js';
const patches = Array.from({ length: 15 }, (_, i) => ({ id: `1.${i}`, patch: `1.${i}` }));

test('latest presets default to ten and keep catalog version order including 1.10', () => {
  assert.deepEqual(selectPatchRange(patches).rows, patches.slice(5));
  assert.deepEqual(selectPatchRange(patches, { mode: 'latest5' }).rows, patches.slice(10));
  assert.deepEqual(selectPatchRange(patches, { mode: 'all' }).rows, patches);
  assert.equal(selectPatchRange(patches, { mode: 'latest5' }).label, '1.10 – 1.14');
  assert.deepEqual(selectPatchRange(patches.slice(0, 2)).rows, patches.slice(0, 2));
  assert.deepEqual(selectPatchRange([...patches, { id: '2.0', patch: '2.0' }]).rows.at(-1), { id: '2.0', patch: '2.0' });
});

test('custom range is inclusive, handles reversed endpoints and missing saved patches', () => {
  assert.deepEqual(selectPatchRange(patches, { mode: 'custom', startId: '1.9', endId: '1.11' }).rows, patches.slice(9, 12));
  assert.deepEqual(selectPatchRange(patches, { mode: 'custom', startId: '1.11', endId: '1.9' }).rows, patches.slice(9, 12));
  const single = selectPatchRange(patches, { mode: 'custom', startId: '1.10', endId: '1.10' });
  assert.equal(single.label, '1.10');
  assert.equal(single.rows.length, 1);
  assert.deepEqual(selectPatchRange(patches, { mode: 'custom', startId: 'removed', endId: '1.1' }).rows, patches.slice(0, 2));
  assert.deepEqual(selectPatchRange(patches, { mode: 'custom', startId: '1.14', endId: 'removed' }).rows, patches.slice(14));
  assert.deepEqual(selectPatchRange([]).rows, []);
});

test('range preferences tolerate blocked storage, corrupt JSON and invalid modes', () => {
  const game = { id: 'test', patches };
  for (const storage of [{ getItem() { throw Error('blocked'); } }, { getItem: () => '{broken' }, { getItem: () => 'null' }, { getItem: () => '{"mode":"invalid"}' }]) {
    assert.deepEqual(readPatchRange(game, storage), { mode: 'latest10' });
  }
  assert.deepEqual(readPatchRange(game, { getItem: () => '{"mode":"custom","startId":"1.10","endId":"1.11"}' }), { mode: 'custom', startId: '1.10', endId: '1.11' });
});

test('the selected period determines aggregate patch count and average in every game', () => {
  for (const game of GAME_CATALOG.games) {
    const chosen = selectPatchRange(game.patches, { mode: 'latest5' }).rows;
    const totals = aggregateTotals(chosen, game.defaultOptions, game);
    assert.equal(totals.patchCount, Math.min(5, game.patches.length));
    assert.ok(Number.isFinite(totals.totalCharacterPullsNoBasicExact));
    const single = selectPatchRange(game.patches, { mode: 'custom', startId: game.patches[0].id, endId: game.patches[0].id }).rows;
    assert.equal(aggregateTotals(single, game.defaultOptions, game).patchCount, 1);
  }
});

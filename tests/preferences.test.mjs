import test from 'node:test';
import assert from 'node:assert/strict';
import { readPreference, writePreference, readOptions } from '../src/lib/preferences.js';
import { GAME_CATALOG } from '../src/data/patches.js';

test('storage failure and invalid JSON preserve usable defaults', () => {
  const blocked = { getItem() { throw Error('blocked'); }, setItem() { throw Error('quota'); } };
  assert.equal(readPreference('key', 'fallback', blocked), 'fallback');
  assert.equal(writePreference('key', 'value', blocked), false);
  for (const game of GAME_CATALOG.games) {
    assert.deepEqual(readOptions(game, blocked), game.defaultOptions);
    assert.deepEqual(readOptions(game, { getItem: () => '{bad' }), game.defaultOptions);
    assert.deepEqual(readOptions(game, { getItem: () => 'null' }), game.defaultOptions);
  }
});
test('only valid, known options are restored', () => {
  for (const game of GAME_CATALOG.games) {
    const saved = { ...game.defaultOptions, monthlySub: false, battlePassTier: 9000, arbitrary: 'ignored' };
    const result = readOptions(game, { getItem: () => JSON.stringify(saved) });
    assert.equal(result.monthlySub, false);
    assert.equal(result.battlePassTier, game.defaultOptions.battlePassTier);
    assert.equal(result.arbitrary, undefined);
    const invalid = readOptions(game, { getItem: () => '{"monthlySub":"false"}' });
    assert.equal(invalid.monthlySub, game.defaultOptions.monthlySub);
  }
});

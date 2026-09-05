import test from 'node:test';
import assert from 'node:assert/strict';
import { GAME_CATALOG, getGameById, refreshGeneratedData } from '../src/data/patches.js';
import { calculatePatchTotals, aggregateTotals } from '../src/domain/calculation.js';

test('all game catalogs calculate finite, consistent totals for every option combination', () => {
  for (const game of GAME_CATALOG.games) {
    assert.ok(game.patches.length > 0);
    const flags = (game.ui.optionalToggles || []).map((flag) => flag.key);
    for (let mask = 0; mask < 2 ** flags.length; mask++) {
      for (const monthlySub of [false, true]) for (const battlePassTier of [1, 2, 3]) {
        const options = { ...game.defaultOptions, monthlySub, battlePassTier };
        flags.forEach((key, i) => { options[key] = Boolean(mask & (1 << i)); });
        let sum = 0;
        for (const patch of game.patches) {
          const total = calculatePatchTotals(patch, options, game);
          assert.ok(Number.isFinite(total.totalCharacterPullsNoBasicExact), `${game.id}/${patch.id}`);
          for (const value of Object.values(total.resources)) assert.ok(Number.isFinite(value));
          sum += total.totalCharacterPullsNoBasicExact;
        }
        assert.ok(Math.abs(aggregateTotals(game.patches, options, game).totalCharacterPullsNoBasicExact - sum) < 1e-8);
      }
    }
  }
});

test('currency, featured permits and paid gates have known expected totals', () => {
  const game = getGameById('genshin-impact');
  const patch = { patch:'test', durationDays:42, sources:[
    { id:'base', gate:'always', rewards:{ primogem:320, intertwinedFate:3, acquaintFate:99 } },
    { id:'monthly', gate:'monthly', rewards:{primogem:160} },
    { id:'bp', gate:'bp2', rewards:{intertwinedFate:4} },
  ] };
  assert.equal(calculatePatchTotals(patch, {monthlySub:false,battlePassTier:1}, game).totalCharacterPullsNoBasicExact, 5);
  assert.equal(calculatePatchTotals(patch, {monthlySub:true,battlePassTier:2}, game).totalCharacterPullsNoBasicExact, 10);
});

test('refresh updates the active catalog and rejects an invalid batch without partial changes', async () => {
  const original = GAME_CATALOG.games;
  try {
    const id = 'genshin-impact';
    const game = getGameById(id);
    const patches = structuredClone(game.patches);
    patches[0].sources[0].pulls = 1234;
    let requestedURL;
    await refreshGeneratedData([id], async (url) => {
      requestedURL = new URL(url);
      return {GENERATED_PATCHES:patches, GENERATED_PATCHES_META:{generatedAt:'2026-09-05T00:00:00Z'}};
    });
    assert.ok(requestedURL.searchParams.has('v'));
    assert.equal(getGameById(id).patches[0].sources[0].pulls, 1234);
    assert.equal(getGameById(id).generatedAt, '2026-09-05T00:00:00Z');
    const beforeFailedBatch = GAME_CATALOG.games;
    await assert.rejects(refreshGeneratedData([id,'honkai-star-rail'], async (url) => {
      if (url.includes('hsr.generated')) throw new Error('network failed');
      return {GENERATED_PATCHES:patches};
    }));
    assert.equal(GAME_CATALOG.games, beforeFailedBatch);
    await assert.rejects(refreshGeneratedData([id], async () => ({GENERATED_PATCHES:[]})));
    assert.equal(GAME_CATALOG.games, beforeFailedBatch);
  } finally { GAME_CATALOG.games = original; }
});

test('malformed and duplicate generated patches preserve the complete visible history', async () => {
  const original = GAME_CATALOG.games;
  const game = getGameById('honkai-star-rail');
  for (const patches of [[{broken:true}], [null], [game.patches[0], game.patches[0]]]) {
    await assert.rejects(refreshGeneratedData([game.id], async () => ({
      GENERATED_PATCHES:patches, GENERATED_PATCHES_META:{generatedAt:'2026-09-05T00:00:00Z'},
    })));
    assert.equal(GAME_CATALOG.games, original);
    assert.equal(getGameById(game.id).patches.length, game.patches.length);
  }
});

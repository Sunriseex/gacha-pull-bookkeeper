import test from 'node:test';
import assert from 'node:assert/strict';
import { BANNER_CATALOG, getPatchBanners, bannerSummary, validateBannerCatalog } from '../src/domain/banners.js';
import { GAME_CATALOG } from '../src/data/patches.js';

test('every supported game has reviewed banner evidence and explicit completeness', () => {
  assert.deepEqual(Object.keys(BANNER_CATALOG).sort(), GAME_CATALOG.games.map(game => game.id).sort());
  assert.equal(validateBannerCatalog(BANNER_CATALOG), true);
  for (const patches of Object.values(BANNER_CATALOG)) assert.ok(Object.keys(patches).length > 0);
});
test('reruns and variant characters retain the reviewed identity rather than guessing first release', () => {
  const genshin = getPatchBanners('genshin-impact', '1.4');
  assert.deepEqual(genshin.phases.flatMap(phase => phase.characters.map(character => character.appearance)), ['rerun', 'rerun']);
  const hsr = getPatchBanners('honkai-star-rail', '4.5');
  assert.equal(hsr.phases[0].characters[0].name, 'Robin · Summeretto');
  assert.equal(hsr.phases[0].characters[0].appearance, 'debut');
  assert.equal(hsr.complete, false);
  assert.equal(getPatchBanners('genshin-impact', '999.0'), null);
  assert.match(bannerSummary('genshin-impact', '999.0'), /not reviewed/);
});
test('missing sources, incomplete warnings, duplicate appearances and malformed labels fail validation', () => {
  for (const mutate of [e => e.sources = [], e => e.sources = ['javascript:alert(1)'], e => { e.complete = false; e.note = ''; }, e => e.phases[0].characters.push(e.phases[0].characters[0]), e => e.phases[0].characters[0].appearance = 'assumed']) {
    const entry = structuredClone(BANNER_CATALOG['genshin-impact']['1.4']);
    mutate(entry);
    assert.throws(() => validateBannerCatalog({ 'genshin-impact': { '1.4': entry } }));
  }
});

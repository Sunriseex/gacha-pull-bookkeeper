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
  assert.equal(hsr.complete, true);
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


test('all income patches have complete banner coverage, including the published WuWa 3.7', () => {
  const cutoffs = { 'arknights-endfield': '1.5', 'wuthering-waves': '3.7', 'zenless-zone-zero': '3.2', 'genshin-impact': '7.1', 'honkai-star-rail': '4.5' };
  for (const game of GAME_CATALOG.games) {
    const [major, minor] = cutoffs[game.id].split('.').map(Number);
    for (const patch of game.patches) {
      const [a, b] = patch.id.split('.').map(Number);
      if (a < major || (a === major && b <= minor)) assert.equal(getPatchBanners(game.id, patch.id)?.complete, true, `${game.id}/${patch.id}`);
    }
  }
  assert.equal(getPatchBanners('wuthering-waves', '3.7').complete, true);
});

test('a debut occurs once and reruns or ongoing banners follow an established release', () => {
  const releasedAtLaunch = {
    'genshin-impact': ['Keqing', 'Diluc', 'Jean', 'Mona', 'Qiqi'],
    'arknights-endfield': ['Ardelia', 'Pogranichnik'],
  };
  for (const [game, patches] of Object.entries(BANNER_CATALOG)) {
    const released = new Set(releasedAtLaunch[game] ?? []);
    const ordered = Object.entries(patches).sort(([a], [b]) => {
      const av = a.split('.').map(Number), bv = b.split('.').map(Number);
      return av[0] - bv[0] || av[1] - bv[1];
    });
    for (const [version, entry] of ordered) for (const phase of entry.phases) for (const character of phase.characters) {
      const context = `${game}/${version}/${character.name}`;
      if (character.appearance === 'debut') {
        assert.equal(released.has(character.name), false, `Repeated debut: ${context}`);
        released.add(character.name);
      } else assert.ok(released.has(character.name), `Appearance before release: ${context}`);
    }
  }
});

test('special banner windows preserve third phases, choices, and continuing collaborations', () => {
  assert.equal(getPatchBanners('genshin-impact', '1.3').phases.length, 3);
  assert.equal(getPatchBanners('honkai-star-rail', '3.8').phases[2].label, 'Phase 3');
  assert.equal(getPatchBanners('genshin-impact', '6.5').phases.at(-1).characters.length, 5);
  assert.equal(getPatchBanners('wuthering-waves', '3.5').phases.at(-1).characters.length, 6);
  const collab = getPatchBanners('honkai-star-rail', '4.5').phases.at(-1);
  assert.equal(collab.characters.length, 4);
  assert.ok(collab.characters.every(character => character.appearance === 'ongoing'));
  assert.deepEqual(getPatchBanners('arknights-endfield', '1.3').phases.flatMap(p => p.characters.map(c => c.name)), ['Mi Fu', 'Camille']);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, statSync } from 'node:fs';
const banners = JSON.parse(readFileSync('src/data/banners.json'));
const icons = JSON.parse(readFileSync('src/data/character-icons.json'));

test('every archived character has a local icon and recorded provenance', () => {
  for (const [game, entries] of Object.entries(banners)) {
    const names = new Set(Object.values(entries).flatMap(entry => entry.phases.flatMap(phase => phase.characters.map(character => character.name))));
    for (const name of names) {
      const icon = icons[game]?.[name];
      assert.ok(icon, `${game}: ${name}`);
      assert.match(icon.src, new RegExp(`^assets/characters/${game}/[a-z0-9]+\\.svg$`));
      assert.ok(statSync(icon.src).size < 24000, `${name}: oversized icon`);
      assert.match(readFileSync(icon.src, 'utf8'), /href="data:image\/webp;base64,/);
      assert.equal(new URL(icon.source).protocol, 'https:');
      assert.equal(new URL(icon.sourceImage).protocol, 'https:');
    }
  }
});

test('alternate character forms use distinct images', () => {
  for (const [game, original, variant] of [
    ['honkai-star-rail', 'Robin', 'Robin · Summeretto'],
    ['honkai-star-rail', 'Aventurine', 'Aventurine · Waveflair'],
    ['honkai-star-rail', 'Silver Wolf', 'Silver Wolf LV.999'],
    ['honkai-star-rail', 'Dan Heng · Imbibitor Lunae', 'Dan Heng · Permansor Terrae'],
  ]) {
    assert.notEqual(icons[game][original].src, icons[game][variant].src);
    assert.notEqual(readFileSync(icons[game][original].src, 'utf8'), readFileSync(icons[game][variant].src, 'utf8'));
  }
});

import catalog from '../data/banners.json' with { type: 'json' };

// Kept outside patchsync's generated income modules so sync cannot erase reviews.
// A first appearance in this partial archive never implies a character debut.
export const BANNER_CATALOG = catalog;
export function validateBannerCatalog(input) {
  for (const [gameId, patches] of Object.entries(input)) {
    if (!gameId || !patches || typeof patches !== 'object') throw Error('Invalid banner game');
    for (const [patchId, entry] of Object.entries(patches)) {
      const context = `${gameId}/${patchId}`;
      if (!/^\d+\.\d+$/.test(patchId) || !/^\d{4}-\d{2}-\d{2}$/.test(entry.reviewedAt) || !Number.isFinite(Date.parse(entry.reviewedAt))) throw Error(`Invalid banner identity: ${context}`);
      if (typeof entry.complete !== 'boolean' || !Array.isArray(entry.sources) || !entry.sources.length || !entry.sources.every(url => { try { return new URL(url).protocol === 'https:'; } catch { return false; } })) throw Error(`Missing banner evidence: ${context}`);
      if (!entry.complete && !entry.note?.trim()) throw Error(`Partial history needs a note: ${context}`);
      if (!Array.isArray(entry.phases) || !entry.phases.length) throw Error(`Missing banner phases: ${context}`);
      const labels = new Set();
      for (const phase of entry.phases) {
        if (!phase.label?.trim() || labels.has(phase.label) || !Array.isArray(phase.characters) || !phase.characters.length) throw Error(`Invalid banner phase: ${context}`);
        labels.add(phase.label);
        const names = new Set();
        for (const character of phase.characters) {
          if (!character.name?.trim() || names.has(character.name) || !['debut', 'rerun'].includes(character.appearance)) throw Error(`Invalid banner appearance: ${context}`);
          names.add(character.name);
        }
      }
    }
  }
  return true;
}
export function getPatchBanners(gameId, patchId) {
  return catalog[gameId]?.[patchId] ?? null;
}
export function bannerSummary(gameId, patchId) {
  const entry = getPatchBanners(gameId, patchId);
  return entry ? [...new Set(entry.phases.flatMap(phase => phase.characters.map(character => character.name)))].join(' · ') : 'Banner history not reviewed yet';
}

import { DEFAULT_PATCH_RANGE, selectPatchRange } from '../domain/patch-range.js';
// Storage is optional: blocked cookies/quota errors must never prevent calculation.
export function readPreference(key, fallback, storage) {
  try { return (storage ?? globalThis.localStorage).getItem(key) ?? fallback; }
  catch { return fallback; }
}
export function writePreference(key, value, storage) {
  try { (storage ?? globalThis.localStorage).setItem(key, value); return true; }
  catch { return false; }
}
export function readOptions(game, storage) {
  const defaults = { ...game.defaultOptions };
  try {
    const saved = JSON.parse(readPreference(`bookkeeper:options:${game.id}`, '{}', storage));
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) return defaults;
    for (const key of Object.keys(defaults)) {
      if (key === 'battlePassTier') {
        if (game.ui.battlePass.tiers.some(tier => tier.value === saved[key])) defaults[key] = saved[key];
      } else if (typeof saved[key] === 'boolean') defaults[key] = saved[key];
    }
  } catch { /* malformed preferences fall back to defaults */ }
  return defaults;
}

export function readPatchRange(game, storage) {
  try {
    const saved = JSON.parse(readPreference(`bookkeeper:range:${game.id}`, 'null', storage));
    return selectPatchRange(game.patches, saved ?? DEFAULT_PATCH_RANGE).selection;
  } catch { return { ...DEFAULT_PATCH_RANGE }; }
}

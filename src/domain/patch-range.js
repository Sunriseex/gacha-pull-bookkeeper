export const DEFAULT_PATCH_RANGE = { mode: 'latest10' };
export const PATCH_RANGE_MODES = ['latest5', 'latest10', 'all', 'custom', 'single'];

// Catalog rows are already ordered by patch version. Never compare versions as floats.
export function selectPatchRange(patches, selection = DEFAULT_PATCH_RANGE) {
  const mode = PATCH_RANGE_MODES.includes(selection?.mode) ? selection.mode : 'latest10';
  if (!patches.length) return { rows: [], selection: { mode }, label: 'No patches' };
  let rows;
  let normalized = { mode };
  if (mode === 'single') {
    const row = patches.find(row => row.id === selection.patchId) ?? patches.at(-1);
    rows = [row];
    normalized = { mode, patchId: row.id };
  } else if (mode === 'all') rows = patches;
  else if (mode === 'custom') {
    let start = patches.findIndex(row => row.id === selection.startId);
    let end = patches.findIndex(row => row.id === selection.endId);
    if (start < 0) start = 0;
    if (end < 0) end = patches.length - 1;
    if (start > end) [start, end] = [end, start];
    normalized = { mode, startId: patches[start].id, endId: patches[end].id };
    rows = patches.slice(start, end + 1);
  } else rows = patches.slice(mode === 'latest5' ? -5 : -10);
  const first = rows[0].patch;
  const last = rows.at(-1).patch;
  return { rows, selection: normalized, label: rows.length === 1 ? first : `${first} – ${last}` };
}

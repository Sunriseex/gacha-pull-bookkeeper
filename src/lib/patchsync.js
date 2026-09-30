import { readPreference, writePreference } from './preferences.js';
import { refreshGeneratedData } from '../data/patches.js';

export async function syncGames(promptToken) {
  const base = readPreference('bookkeeper:patchsyncBaseUrl', 'http://127.0.0.1:8787').trim().replace(/\/$/, '');
  const request = async token => {
    const response = await fetch(`${base}/sync-all`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(token ? { 'X-Patchsync-Token': token } : {}) },
      body: '{}',
      signal: AbortSignal.timeout(300000),
    });
    const text = await response.text();
    let payload;
    try { payload = JSON.parse(text); }
    catch { throw new Error(`Invalid sync response (HTTP ${response.status})`); }
    return { response, payload };
  };
  let result = await request(readPreference('bookkeeper:patchsyncToken', '').trim());
  if (result.response.status === 401) {
    const token = await promptToken();
    if (!token) return null;
    writePreference('bookkeeper:patchsyncToken', token);
    result = await request(token);
  }
  const { response, payload } = result;
  if (!response.ok || (payload.ok !== true && !Array.isArray(payload.results))) {
    throw new Error(payload.message || `Sync failed (HTTP ${response.status})`);
  }
  const results = payload.results ?? [];
  for (const entry of results) {
    for (const line of entry.logs ?? []) console.info(`[patchsync:${entry.gameId}]`, line);
  }
  const updated = results.filter(entry => !entry.error).map(entry => entry.gameId);
  if (updated.length) await refreshGeneratedData(updated);
  const failed = results.filter(entry => entry.error);
  return {
    message: failed.length ? `Sync errors: ${failed.length}/${results.length}` : `Synced ${results.length} games`,
    errors: failed.map(entry => `${entry.gameId}: ${entry.error}`),
  };
}

import { test, expect } from '@playwright/test';
const games = ['Arknights: Endfield', 'Wuthering Waves', 'Zenless Zone Zero', 'Genshin Impact', 'Honkai: Star Rail'];

test('every game renders without overflow or runtime errors', async ({ page }, testInfo) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('/');
  for (const title of games) {
    await page.getByRole('button', { name: title, exact: true }).click();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await expect(page.getByTestId('summary-value')).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const details = page.locator('.mobile-breakdown');
    if (testInfo.project.name.startsWith('mobile')) {
      await expect(details).toBeVisible();
      const trigger = details.getByRole('button').first();
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');
      await expect(details.locator('dl').first()).toBeVisible();
    } else {
      await page.getByRole('button', { name: 'Show patch details' }).click();
      await page.locator('#patch-details').getByRole('button').first().click();
      await expect(page.locator('#patch-details dl').first()).toBeVisible();
    }
  }
  expect(errors).toEqual([]);
  await page.screenshot({ path: `test-results/${testInfo.project.name}-dashboard.png`, fullPage: true });
});

test('settings update totals and survive reload separately per game', async ({ page }) => {
  await page.goto('/');
  const monthly = page.getByRole('switch').first();
  const previous = await page.getByTestId('summary-value').first().textContent();
  const original = await monthly.getAttribute('aria-checked');
  await monthly.click();
  const next = await monthly.getAttribute('aria-checked');
  expect(next).not.toBe(original);
  expect(await page.getByTestId('summary-value').first().textContent()).not.toBe(previous);
  await page.reload();
  await expect(page.getByRole('switch').first()).toHaveAttribute('aria-checked', next);
  await page.getByRole('button', { name: 'Wuthering Waves', exact: true }).click();
  await page.getByRole('button', { name: 'Arknights: Endfield', exact: true }).click();
  await expect(page.getByRole('switch').first()).toHaveAttribute('aria-checked', next);
  await page.getByRole('combobox', { name: 'Battle Pass', exact: true }).click();
  await page.getByRole('option', { name: 'Basic Supply', exact: true }).click();
  await page.reload();
  await expect(page.getByRole('combobox', { name: 'Battle Pass', exact: true })).toContainText('Basic Supply');
});

test('blocked storage does not prevent startup or interaction', async ({ page }) => {
  await page.addInitScript(() => Object.defineProperty(window, 'localStorage', { get() { throw new DOMException('Blocked', 'SecurityError'); } }));
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Arknights: Endfield', exact: true })).toBeVisible();
  await page.getByRole('switch').first().click();
  await page.getByRole('button', { name: 'Genshin Impact', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Genshin Impact', exact: true })).toBeVisible();
});

test('hide UI removes controls from focus and restores dashboard', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Hide UI' }).click();
  await expect(page.getByRole('main')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show UI' }).click();
  await expect(page.getByRole('main')).toBeVisible();
});

test('public deployment hides owner sync', async ({ page }) => {
  await page.route('https://pulls.sunriseex.dev/**', async route => {
    const url = new URL(route.request().url());
    const response = await page.request.get(`http://127.0.0.1:4173${url.pathname}${url.search}`);
    await route.fulfill({ response });
  });
  await page.goto('https://pulls.sunriseex.dev/');
  await expect(page.getByRole('heading', { name: 'Arknights: Endfield', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync Sheets' })).toHaveCount(0);
});

test('token dialog can cancel and reopen without retaining secret', async ({ page }) => {
  await page.route('http://127.0.0.1:8787/sync-all', route => route.fulfill({ status: 401, json: { ok: false, message: 'Unauthorized' } }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sync Sheets' }).click();
  await page.getByLabel('Token', { exact: true }).fill('not-a-real-secret');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Sync Sheets' }).click();
  await expect(page.getByLabel('Token', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('authorized sync refreshes stable generated modules in the production build', async ({ page }) => {
  const { readFileSync } = await import('node:fs');
  const module = readFileSync('src/data/endfield.generated.js', 'utf8').replace(/"generatedAt":\s*"[^"]+"/, '"generatedAt": "2026-09-30T00:00:00Z"');
  await page.route('http://127.0.0.1:8787/sync-all', async route => {
    if (route.request().headers()['x-patchsync-token'] !== 'test-token') {
      await route.fulfill({ status: 401, json: { ok: false, message: 'Unauthorized' } });
    } else await route.fulfill({ json: { ok: true, results: [{ gameId: 'arknights-endfield', patches: [] }] } });
  });
  await page.route('**/src/data/endfield.generated.js?v=*', route => route.fulfill({ contentType: 'text/javascript', body: module }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Sync Sheets' }).click();
  await page.getByLabel('Token', { exact: true }).fill('test-token');
  await page.getByRole('button', { name: 'Save and sync' }).click();
  await expect(page.getByText(/Updated: Sep 30, 2026/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sync Sheets' })).toBeEnabled();
});

async function choose(page, label, option) {
  await page.getByRole('combobox', { name: label, exact: true }).click();
  await page.getByRole('option', { name: option, exact: true }).click();
}

test('range filters all views, supports single patch, and saves separately per game', async ({ page }, testInfo) => {
  const { GAME_CATALOG } = await import('../../src/data/patches.js');
  const { aggregateTotals } = await import('../../src/domain/calculation.js');
  const { cardsConfig } = await import('../../src/ui/render.js');
  const game = GAME_CATALOG.games.find(game => game.id === 'genshin-impact');
  const format = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Genshin Impact', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Patch range', exact: true })).toContainText('Last 10 patches');
  await expect(page.getByTestId('period-label')).toContainText(`10 of ${game.patches.length} patches`);
  await choose(page, 'Patch range', 'Last 5 patches');
  await expect(page.getByTestId('period-label')).toContainText(`5 of ${game.patches.length} patches`);
  const expected = cardsConfig(aggregateTotals(game.patches.slice(-5), game.defaultOptions, game), game).slice(0, 3).map(card => format.format(card.value));
  await expect(page.getByTestId('summary-value')).toHaveText(expected);
  if (testInfo.project.name.startsWith('mobile')) await expect(page.locator('.mobile-breakdown [data-slot="accordion-item"]')).toHaveCount(5);
  else {
    await page.getByRole('button', { name: 'Show patch details' }).click();
    await expect(page.locator('#patch-details [data-slot="accordion-item"]')).toHaveCount(5);
  }
  await choose(page, 'Patch range', 'Custom range');
  await choose(page, 'From patch', '1.0');
  await choose(page, 'To patch', '1.2');
  await expect(page.getByTestId('period-label')).toContainText('Totals for 1.0 – 1.2 · 3 of');
  await page.reload();
  await expect(page.getByTestId('period-label')).toContainText('Totals for 1.0 – 1.2 · 3 of');
  await page.getByRole('button', { name: 'Honkai: Star Rail', exact: true }).click();
  await expect(page.getByRole('combobox', { name: 'Patch range', exact: true })).toContainText('Last 10 patches');
  await page.getByRole('button', { name: 'Genshin Impact', exact: true }).click();
  await expect(page.getByTestId('period-label')).toContainText('Totals for 1.0 – 1.2 · 3 of');
  await choose(page, 'From patch', '1.3');
  await expect(page.getByTestId('period-label')).toContainText('Totals for 1.3 · 1 of');
  await choose(page, 'To patch', '1.1');
  await expect(page.getByTestId('period-label')).toContainText('Totals for 1.1 · 1 of');
});

test('full history scrolls only the chart and switching ranges restores scroll position', async ({ page }, testInfo) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Genshin Impact', exact: true }).click();
  await choose(page, 'Patch range', 'All patches');
  const { GAME_CATALOG } = await import('../../src/data/patches.js');
  const count = GAME_CATALOG.games.find(game => game.id === 'genshin-impact').patches.length;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  if (testInfo.project.name.startsWith('mobile')) {
    await expect(page.locator('.mobile-breakdown [data-slot="accordion-item"]')).toHaveCount(count);
  } else {
    const scroll = page.getByRole('region', { name: 'Patch chart, horizontally scrollable' });
    const size = await scroll.evaluate(el => ({ width: el.clientWidth, scrollWidth: el.scrollWidth, canvasWidth: el.querySelector('canvas').clientWidth }));
    expect(size.scrollWidth).toBeGreaterThan(size.width);
    expect((size.canvasWidth - 76) / count).toBeGreaterThanOrEqual(64);
    await scroll.focus();
    await page.keyboard.press('ArrowRight');
    await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBeGreaterThan(0);
    await scroll.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const previousScroll = await scroll.evaluate(el => el.scrollLeft);
    await page.getByRole('switch').first().click();
    await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBe(previousScroll);
    await page.screenshot({ path: `test-results/${testInfo.project.name}-range-full.png`, fullPage: true });
    await choose(page, 'Patch range', 'Last 5 patches');
    await expect.poll(() => scroll.evaluate(el => el.scrollLeft)).toBe(0);
  }
  await page.screenshot({ path: `test-results/${testInfo.project.name}-range.png`, fullPage: true });
});

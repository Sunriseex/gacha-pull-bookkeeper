# Patch Update Workflow (Owner)

## Goal

Add a new patch quickly and safely for any supported game, while keeping updates owner-only.

## Steps

Option A (recommended): use Google Sheets importer.

1. Start importer service:
   - `cd tools/patchsync`
   - `go run . --serve --auth-token "<your_token>"`
2. In app UI click `Sync Sheets`.
3. Select game tab in the UI.
4. Enter Spreadsheet ID (листы `N.N` подтянутся автоматически).
5. Confirm branch creation if needed.
6. Reload the app.

Option B: manual edit in repository.

1. Create a branch:
   - `git checkout -b data/patch-1.1`
2. Open `src/data/patches.js`.
3. Find target game object in `GAME_CATALOG.games`.
4. Copy an existing patch object for that game.
5. Change:
   - `id`
   - `patch`
   - `versionName`
   - `startDate`
   - `durationDays`
   - `sources`
6. Save and run a syntax check:
   - `Get-ChildItem -Recurse -Filter *.js src | ForEach-Object { node --check $_.FullName }`
7. Run app and verify chart and totals.
8. Commit and open PR.

## Why this is owner-only

- Runtime UI does not allow data editing.
- Data changes happen only through repository commits (or local owner importer writing tracked files).
- Restrict repository write access to your account only.
- Enable branch protection on `master` to block direct pushes.

## Notes

- `src/data/patches.js` has runtime schema validation. If a patch structure is invalid, app startup throws a clear error.
- Generated imports are split per game (`endfield.generated.js`, `wuwa.generated.js`).
- Client-side "password-protected admin mode" is not secure for true owner-only control.

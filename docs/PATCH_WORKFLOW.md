# Patch Update Workflow (Owner)

## Publication and data refresh

- `.github/workflows/weekly-pages-sync.yml` tests pull requests and changes to `master`.
- A push to `master` publishes tested code using the newest generated data from `master` or `github-pages`. It does not depend on Google Sheets availability.
- Every Monday at `05:00 UTC`, the workflow refreshes all games before publishing. A failed game or patch stops publication; the existing site remains intact.
- To refresh manually, run **Weekly Pages Sync** from Actions on `master` with `sync_data` enabled. Disable that input to publish code with existing data.
- Both paths validate the final game catalog before pushing to `github-pages`.
- The GitHub Pages build then deploys that branch to the custom domain.

## Local owner sync

1. Copy `.env.example` to `.env` at the repository root and configure the sources and `PATCHSYNC_TOKEN`.
2. Run `make serve`, or start `python -m http.server 5173 --bind 127.0.0.1` and `go run . --serve` from `tools/patchsync` separately.
3. Open `http://localhost:4173` for `make serve` (5173 for the separate server).
4. Click **Sync Sheets** and enter the token when prompted. Cancel and Escape discard the input.
5. Successful games are reloaded automatically, including their chart and update date. Failed games retain their previous data and show an error.

The button is available only on localhost pages. Public visitors use the published data and do not need a local service. To update the public site, use repository changes or Actions.

## Failure guarantees and recovery

- A game update is prepared in memory. Failure to fetch/parse any discovered patch or required Data/Summary overrides aborts that game before writing.
- Existing generated files are replaced using a temporary file and rename. Malformed existing modules are rejected instead of treated as empty history.
- HTTP sync transactions are serialized. An exclusive `<output>.lock` directory also prevents a CLI process from writing the same output concurrently.
- After a forced termination, first confirm no sync process is running; then remove the stale `.generated.js.lock` directory shown in the error and retry.
- Never delete a lock belonging to an active sync. Restore malformed generated data from a known-good Git revision before retrying.
- `--dry-run` validates without writing generated files or creating a Git branch.

## Tests

From the repository root, run:

```bash
node --test tests/*.test.mjs
(cd tools/patchsync && go test -race ./... && go vet ./...)
```

Tests cover failed source downloads/parsing, preserving old data, output locking, atomic replacement, token cancellation, catalog reload, calculation gates and deployment baseline selection. They use offline fixtures; they do not assert that third-party spreadsheets always retain their layout.

## Source number format

Reward cells and Data overrides use a decimal point and optional comma thousands groups (for example `0.125`, `1.250`, `1,250.5`). Empty reward cells mean zero; invalid nonempty values such as `#REF!` fail parsing instead of becoming zero. Localized decimal-comma exports must be normalized to this source format before import.

Published sheet discovery is cached only within one sync. A later sync fetches the tab list again, so newly added patches are discovered without restarting the service.

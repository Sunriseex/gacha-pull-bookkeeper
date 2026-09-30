# Reviewed character banners

The patch picker supports all five games and all patches from the income catalog. `One patch` opens a grouped version grid with previous/next navigation. Selections are saved per game.

Banner coverage is **partial**: the initial review covers 12 patches. Other patches explicitly say their banner history has not been reviewed. A missing record does not mean no banners ran.

| Game | Reviewed patches |
| --- | --- |
| Arknights: Endfield | 1.0, 1.5 |
| Wuthering Waves | 1.3, 3.6, 3.7 |
| Zenless Zone Zero | 1.5, 3.2 |
| Genshin Impact | 1.4, 7.1 |
| Honkai: Star Rail | 1.4, 4.0, 4.5 |

## Scope and evidence

Show promoted highest-rarity characters: 5-star characters, 6-star operators, or S-Rank agents. Standard/off-rate pools, lower-rarity rate-ups, weapons and free character rewards are excluded. For example, Endfield pool members listed as possible drops are not all treated as featured characters.

Each entry in `src/data/banners.json` has a review date, source URLs, explicitly reviewed debut/rerun labels and named phases or banner windows. Full-version banners have their own group instead of being forced into a three-week phase. Distinct character forms keep their full identity, such as Robin · Summeretto. A character's first appearance in this partial archive is **never** used to infer a debut.

Primary publisher notices are used where available, with archive/editorial references for phase and rerun cross-checks. The cited pages identify the actual featured character rather than merely listing characters available in the pool. No leak or speculation source is used. The references for every reviewed patch are visible in the UI and stored alongside its data.

HSR 4.0 and 4.5 list regular character Warps but are explicitly marked partial because ongoing collaboration Warps have not yet been reviewed. No uncertain dates are displayed. Published Wuthering Waves data includes 3.7 even when the master income baseline is still 3.6.

## Add or correct a patch

1. Find the publisher's banner/update notice and confirm version, featured highest-rarity characters and window/phase. Cross-check archive sources where the notice alone does not establish debut versus rerun.
2. Store each banner occurrence in its proper phase/window. Preserve reruns and distinct forms. Do not guess an appearance label from this archive's coverage.
3. Add evidence URLs and `reviewedAt`. Set `complete: false` with a clear `note` whenever part of the scope is still missing; otherwise use `complete: true`.
4. Run `npm test` and `npm run build`. Tests validate evidence fields and reject duplicate characters within a phase, invalid appearance labels and incomplete records without explanations.

This catalog is maintained separately from `*.generated.js`. Owner sync and scheduled income updates cannot erase these reviewed entries. Newly synced patches remain explicitly unreviewed until their banners are checked.

# Reviewed character banners

The patch picker supports all five games and all patches from the income catalog. `One patch` opens a grouped version grid with previous/next navigation. Selections are saved per game.

The review dated 2026-09-30 covers **131 patches**, including the published WuWa 3.7 beyond the master income baseline. All entries are complete within the scope below. A newly synced patch with no banner entry is still explicitly unreviewed; absence never means no banner ran.

| Game | Reviewed versions | Patches |
| --- | --- | ---: |
| Arknights: Endfield | 1.0–1.5 | 6 |
| Wuthering Waves | 1.0–1.4, 2.0–2.8, 3.0–3.7 | 22 |
| Zenless Zone Zero | 1.0–1.7, 2.0–2.8, 3.0–3.2 | 20 |
| Genshin Impact | 1.0–1.6, 2.0–2.8, 3.0–3.8, 4.0–4.8, 5.0–5.8, 6.0–6.7, 7.0–7.1 | 53 |
| Honkai: Star Rail | 1.0–1.6, 2.0–2.7, 3.0–3.8, 4.0–4.5 | 30 |

## Scope and evidence

Show promoted highest-rarity characters: 5-star characters, 6-star operators, or S-Rank agents. Include time-limited character selectors (Chronicled / Lightrace Wish, anniversary Convene, Exclusive Rescreening, Fest of Brilliance) and collaboration character banners. Standard/off-rate pools, permanent account-specific beginner banners, lower-rarity rate-ups, weapons and free character rewards are excluded. For example, Endfield off-rate operators listed as possible drops are not treated as featured characters. WuWa New Voyage beginner banners are not a patch-wide rerun.

Each entry in `src/data/banners.json` has a review date, source URLs, explicitly reviewed appearance labels and named phases or banner windows. Keep three phases where applicable (Genshin 1.3 and HSR 3.8), overlapping windows (WuWa 3.4), and full-version banners (ZZZ 1.4/2.5/3.1, HSR 3.7/4.0/4.1/4.4).

- **Debut**: this character/form is introduced in the patch. Free copies do not remove an actual debut banner from the archive.
- **Rerun**: a returning character appears in a new featured banner or time-limited selector. Existing standard characters such as Keqing are not newly introduced when a promoted banner first features them.
- **Ongoing**: the same collaboration banner continues from an earlier patch. This is not a rerun. HSR Saber/Archer continue after 3.4; Rin Tohsaka/Gilgamesh continue after 4.4.

Distinct character forms keep their full identity: Robin · Summeretto, Aventurine · Waveflair, Dan Heng · Imbibitor Lunae / Permansor Terrae, Silver Wolf LV.999, Himeko · Nova, and Yangyang: Xuanling. Never infer debut from the first record encountered in an incomplete source.

Cross-check archive character/phase rosters (PullDeck, PC Gamer, Icy Veins, LootBar, Endfield Hub) and use publisher notices or their archived copies for current and exceptional banner rules. All evidence links are stored per patch and visible in the UI. Some archive prose/dates have copy errors; only confirmed roster facts are included. Examples resolved during review: Nilou is a debut in Genshin 3.1; Cartethyia is a rerun in WuWa 3.4; HSR 4.2 Phase 2 includes Feixiao; ZZZ Remielle's 3.1 banner runs the whole version. No uncertain date range is displayed, and leak/prediction sections are excluded.

## Add or correct a patch

1. Confirm version, featured highest-rarity characters and window/phase using publisher notices and archive cross-checks. Confirm debut versus rerun separately, preserving variant identity.
2. Store each occurrence in its proper phase/window. Use `ongoing` for uninterrupted banners. Give character selection banners their own named group.
3. Add evidence URLs and `reviewedAt`. Set `complete: false` with a clear `note` if part of the scope is missing, otherwise `complete: true`.
4. Run `npm test` and `npm run build`. Tests validate evidence, reject duplicate characters within a group, check coverage through the reviewed version cutoffs, and verify release chronology and special banner windows.
5. Extend the reviewed cutoffs in the coverage test after checking a new version. Income synchronization can continue to publish later versions with the explicit unreviewed fallback.

The catalog is maintained separately from `*.generated.js`. Owner sync and scheduled income updates cannot erase reviewed entries.

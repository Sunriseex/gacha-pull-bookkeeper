# Gacha Pull Bookkeeper

EN: Local web app for tracking gacha pulls by patch from Google Sheets data.
RU: Локальное веб-приложение для подсчета круток по патчам на основе данных из Google Sheets.

## Supported Games / Поддерживаемые игры
- [Arknights: Endfield](https://docs.google.com/spreadsheets/d/1zGNuQ53R7c190RG40dHxcHv8tJuT3cBaclm8CjI-luY/edit?gid=574733075#gid=574733075)
- [Wuthering Waves](https://docs.google.com/spreadsheets/d/1msSsnWBcXKniykf4rWQCEdk2IQuB9JHy/edit?gid=633316948#gid=633316948)
- [Zenless Zone Zero](https://docs.google.com/spreadsheets/d/e/2PACX-1vTiSx8OSyx-BZktnpT-fh_pQHjjkD8q3sp3Csy2aOI-8CV_QroqxzhhNjiCZNV4IdzhyK3xbipZn9WD/pubhtml)
- [Genshin Impact](https://docs.google.com/spreadsheets/d/1l9HPu2cAzTckdXtr7u-7D8NSKzZNUqOuvbmxERFZ_6w/edit?gid=955728278#gid=955728278)
- [Honkai: Star Rail](https://docs.google.com/spreadsheets/d/e/2PACX-1vRIWjzFwAZZoBvKw2oiNaVpppI9atoV0wxuOjulKRJECrg_BN404d7LoKlHp8RMX8hegDr4b8jlHjYy/pubhtml)

## Requirements / Требования
- `Python 3` for a local static server / для локального статического сервера
- `Go 1.22+` for `tools/patchsync` (optional) / для `tools/patchsync` (опционально)

## Run Locally / Локальный запуск
```bash
python -m http.server 5173
```
Open / Открой: `http://localhost:5173`

## Data Layout / Структура данных
- Main game catalog and UI config / Каталог игр и UI-конфиг: `src/data/patches.js`
- Generated patches / Сгенерированные патчи:
  - `src/data/endfield.generated.js`
  - `src/data/wuwa.generated.js`
  - `src/data/zzz.generated.js`
  - `src/data/genshin.generated.js`
  - `src/data/hsr.generated.js`

## Google Sheets Sync (Optional) / Синхронизация Google Sheets (опционально)
`patchsync` is located in / находится в: `tools/patchsync`

Service mode (for UI Sync button) / Режим сервиса (для кнопки Sync в UI):
```bash
cd tools/patchsync
go run . --serve --auth-token "<your_token>"
```

CLI mode / CLI режим:
```bash
cd tools/patchsync
go run . --game arknights-endfield --spreadsheet-id "<sheet_id_or_url>"
go run . --game wuthering-waves --spreadsheet-id "<sheet_id_or_url>"
go run . --game zenless-zone-zero --spreadsheet-id "<sheet_id_or_url>"
go run . --game genshin-impact --spreadsheet-id "<sheet_id_or_url>"
go run . --game honkai-star-rail --spreadsheet-id "<sheet_id_or_url>"
```

Available `--game` values / Доступные значения `--game`:
- `arknights-endfield`
- `wuthering-waves`
- `zenless-zone-zero`
- `genshin-impact`
- `honkai-star-rail`

Sync behavior / Что делает sync:
- auto-detects patch sheets by `N.N` style names;
- supports published Google Sheets links (`.../spreadsheets/d/e/...`);
- reads `Data` sheet pull overrides when available;
- skips unchanged patches and updates changed patches;
- writes output into the corresponding generated game file.

Полезные флаги / Useful flags:
- `--dry-run` - validate without writing files;
- `--skip-existing=true` - skip unchanged patches (default);
- `--output <path>` - custom output file path.

Workflow notes / Заметки по процессу: `docs/PATCH_WORKFLOW.md`.

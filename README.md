# Gacha Pull Bookkeeper

Production / Продакшен: https://pulls.sunriseex.dev

EN: Static web app for tracking gacha pulls by patch.
RU: Статическое веб-приложение для подсчета круток по патчам.

## Supported Games / Поддерживаемые игры
- [Arknights: Endfield](https://docs.google.com/spreadsheets/d/1zGNuQ53R7c190RG40dHxcHv8tJuT3cBaclm8CjI-luY/edit?gid=574733075#gid=574733075)
- [Wuthering Waves](https://docs.google.com/spreadsheets/d/1msSsnWBcXKniykf4rWQCEdk2IQuB9JHy/edit?gid=633316948#gid=633316948)
- [Zenless Zone Zero](https://docs.google.com/spreadsheets/d/e/2PACX-1vTiSx8OSyx-BZktnpT-fh_pQHjjkD8q3sp3Csy2aOI-8CV_QroqxzhhNjiCZNV4IdzhyK3xbipZn9WD/pubhtml)
- [Genshin Impact](https://docs.google.com/spreadsheets/d/1l9HPu2cAzTckdXtr7u-7D8NSKzZNUqOuvbmxERFZ_6w/edit?gid=955728278#gid=955728278)
- [Honkai: Star Rail](https://docs.google.com/spreadsheets/d/e/2PACX-1vRIWjzFwAZZoBvKw2oiNaVpppI9atoV0wxuOjulKRJECrg_BN404d7LoKlHp8RMX8hegDr4b8jlHjYy/pubhtml)

## Run Locally / Локальный запуск
```bash
npm ci
npm run dev
```
Open / Открой: `http://127.0.0.1:5173`

## Data Layout / Структура данных
- Main game catalog and UI config / Каталог игр и UI-конфиг: `src/data/patches.js`
- Generated patches / Сгенерированные патчи:
  - `src/data/endfield.generated.js`
  - `src/data/wuwa.generated.js`
  - `src/data/zzz.generated.js`
  - `src/data/genshin.generated.js`
  - `src/data/hsr.generated.js`

## Notes / Примечания
- React + Vite + Tailwind CSS 4, with official shadcn/ui components in `src/components/ui`.
- UI theme uses Catppuccin Mocha palette (including chart colors).
- `npm run build` creates a static `dist/` site, including original assets and stable generated-data modules.
- `npm run preview` serves the production build. There is no backend required for public visitors.
- Mobile devices get expandable per-patch source breakdowns; desktop has the canvas chart plus keyboard-accessible details.
- Income settings are saved independently for each game in this browser. Restricted storage falls back to in-memory settings.
- Add UI components with `npx shadcn@latest add <component>`.
- Local owner workflow: run `npm run dev` and, in a second terminal, `(cd tools/patchsync && go run . --serve)`.
- Review and improvement priorities: [docs/REVIEW-2026-09-30.md](docs/REVIEW-2026-09-30.md).

- This branch is static-only for GitHub Pages.
- `master` includes the Go parser/sync tool under `tools/patchsync`; `github-pages` contains only the published site.
- `master` содержит Go-инструмент обновления таблиц; `github-pages` — опубликованный сайт.
- Local owner workflow and failure recovery: [docs/PATCH_WORKFLOW.md](docs/PATCH_WORKFLOW.md).

## Tests / Проверки
```bash
npm test
npm run build
npx playwright install chromium
npm run test:e2e
(cd tools/patchsync && go test -race ./... && go vet ./...)
```
Requires Node.js 24 and Go 1.25 or newer. CI runs these checks before publication.

## License / Лицензия
- EN: This project is licensed under the MIT License. See LICENSE.
- RU: Проект распространяется по лицензии MIT. См. файл LICENSE.

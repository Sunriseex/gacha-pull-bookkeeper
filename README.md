# Gacha Pull Bookkeeper (GitHub Pages)

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

## Notes / Примечания
- This branch is static-only for GitHub Pages.
- Branch does not include table parser/sync tooling.
- Эта ветка предназначена для GitHub Pages и не содержит parser/sync инструментов.

## License / Лицензия
- EN: This project is licensed under the MIT License. See LICENSE.
- RU: Проект распространяется по лицензии MIT. См. файл LICENSE.


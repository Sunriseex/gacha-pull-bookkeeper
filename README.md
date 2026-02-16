# Gacha Pull Bookkeeper

Локальное веб-приложение для подсчета круток по патчам из Google Sheets.

Поддерживаемые игры:
- [Arknights: Endfield](https://docs.google.com/spreadsheets/d/1zGNuQ53R7c190RG40dHxcHv8tJuT3cBaclm8CjI-luY/edit?gid=574733075#gid=574733075)
- [Wuthering Waves](https://docs.google.com/spreadsheets/d/1msSsnWBcXKniykf4rWQCEdk2IQuB9JHy/edit?gid=633316948#gid=633316948)
- [Zenless Zone Zero](https://docs.google.com/spreadsheets/d/e/2PACX-1vTiSx8OSyx-BZktnpT-fh_pQHjjkD8q3sp3Csy2aOI-8CV_QroqxzhhNjiCZNV4IdzhyK3xbipZn9WD/pubhtml)
- [Genshin Impact](https://docs.google.com/spreadsheets/d/1l9HPu2cAzTckdXtr7u-7D8NSKzZNUqOuvbmxERFZ_6w/edit?gid=955728278#gid=955728278)
- [Honkai: Star Rail](https://docs.google.com/spreadsheets/d/e/2PACX-1vRIWjzFwAZZoBvKw2oiNaVpppI9atoV0wxuOjulKRJECrg_BN404d7LoKlHp8RMX8hegDr4b8jlHjYy/pubhtml)

## Требования

- `Python 3` (для локального статического сервера)
- `Go 1.22+` (для `tools/patchsync`)

## Локальный запуск

```bash
python -m http.server 5173
```

Открой `http://localhost:5173`.

## Структура данных

- Каталог игр, UI-конфиг и базовые патчи: `src/data/patches.js`
- Сгенерированные патчи Endfield: `src/data/endfield.generated.js`
- Сгенерированные патчи Wuthering Waves: `src/data/wuwa.generated.js`
- Сгенерированные патчи Zenless Zone Zero: `src/data/zzz.generated.js`
- Сгенерированные патчи Genshin Impact: `src/data/genshin.generated.js`
- Сгенерированные патчи Honkai: Star Rail: `src/data/hsr.generated.js`

## Синхронизация из Google Sheets

`patchsync` находится в `tools/patchsync`.

Режим сервиса (для кнопки Sync в UI):

```bash
cd tools/patchsync
go run . --serve --auth-token "<your_token>"
```

CLI режим:

```bash
cd tools/patchsync
go run . --game arknights-endfield --spreadsheet-id "<sheet_id_or_url>"
go run . --game wuthering-waves --spreadsheet-id "<sheet_id_or_url>"
go run . --game zenless-zone-zero --spreadsheet-id "<sheet_id_or_url>"
go run . --game genshin-impact --spreadsheet-id "<sheet_id_or_url>"
go run . --game honkai-star-rail --spreadsheet-id "<sheet_id_or_url>"
```

Доступные `--game`:
- `arknights-endfield`
- `wuthering-waves`
- `zenless-zone-zero`
- `genshin-impact`
- `honkai-star-rail`

Что делает sync:
- ищет листы патчей по имени версии (`N.N`, поддерживаются суффиксы вроде `3.1 (STC)` или `6.4 est.`);
- поддерживает опубликованные URL Google Sheets формата `.../spreadsheets/d/e/...`;
- читает `Data` лист и применяет pulls override по источникам;
- пропускает патчи без изменений;
- обновляет патчи, если данные в листе изменились;
- пишет результат в соответствующий generated файл игры.

Полезные флаги:
- `--dry-run` - валидация без записи файла;
- `--skip-existing=true` - пропуск патчей без изменений (по умолчанию включено);
- `--output <path>` - кастомный путь output-файла.

## Owner-only поток обновления

- меняй данные только через commit/PR;
- оставь write-доступ к репозиторию только себе;
- включи protection для ветки `master`.

Подробный процесс: `docs/PATCH_WORKFLOW.md`.

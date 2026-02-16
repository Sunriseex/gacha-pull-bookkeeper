# Gacha Pull Bookkeeper

Локальное веб-приложение для подсчета круток по патчам из Google Sheets.

Поддерживаемые игры:
- Arknights: Endfield
- Wuthering Waves
- Zenless Zone Zero

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
```

Доступные `--game`:
- `arknights-endfield`
- `wuthering-waves`
- `zenless-zone-zero`

Что делает sync:
- ищет листы патчей по имени версии (`N.N`, поддерживаются суффиксы вроде `3.1 (STC)`);
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

# Gacha Pull Bookkeeper

Локальное веб-приложение для подсчета круток по патчам.

Поддерживаемые игры:
- Arknights: Endfield
- Wuthering Waves

## Быстрый старт

```bash
python -m http.server 5173
```

Открой `http://localhost:5173`.

## Где лежат данные

- База игр и патчей: `src/data/patches.js`
- Импорт Endfield: `src/data/endfield.generated.js`
- Импорт Wuthering Waves: `src/data/wuwa.generated.js`

## Синхронизация из Google Sheets (patchsync)

Запуск локального сервиса:

```bash
cd tools/patchsync
go run . --serve --auth-token "<your_token>"
```

CLI режим:

```bash
cd tools/patchsync
go run . --game wuthering-waves --spreadsheet-id "<sheet_id_or_url>"
```

Доступные `--game`:
- `arknights-endfield`
- `wuthering-waves`

Что делает sync:
- ищет только листы формата `N.N`;
- пропускает патчи без изменений;
- обновляет патчи, если данные в листе изменились;
- пишет результат в game-specific generated файл.

## Owner-only обновление данных

- меняй данные только через commit/PR;
- оставь write-доступ к репозиторию только себе;
- включи protection для ветки `master`.

Подробный процесс: `docs/PATCH_WORKFLOW.md`.

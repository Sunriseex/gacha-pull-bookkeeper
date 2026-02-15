# Endfield Bookkeeper

Локальное веб-приложение для подсчета круток в Arknights: Endfield.

## Быстрый старт

```bash
python -m http.server 5173
```

Открой `http://localhost:5173`.

## Где лежат данные

- Базовые патчи: `src/data/patches.js`
- Импортированные патчи: `src/data/patches.generated.js`

Если `patches.generated.js` не пустой, патчи объединяются с базовыми по `id`.

## Синхронизация из Google Sheets (patchsync)

Запуск локального сервиса:

```bash
cd tools/patchsync
go run . --serve --auth-token "<your_token>"
```

Генерация токена в PowerShell:

```powershell
[guid]::NewGuid().ToString("N")
```

Что делает sync:

- автоматически ищет только листы формата `N.N`;
- пропускает патчи без изменений;
- обновляет патчи, если данные в листе изменились;
- пишет результат в `src/data/patches.generated.js`.

## Owner-only обновление данных

- делай изменения через commit/PR;
- оставь write-доступ в репозитории только себе;
- включи protection для ветки `master`.

Подробный процесс: `docs/PATCH_WORKFLOW.md`.

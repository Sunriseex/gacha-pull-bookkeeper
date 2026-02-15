# Endfield Bookkeeper

Локальное веб-приложение для подсчета круток.

## Унифицированная схема

Данные теперь хранятся в `src/data/patches.js` как `GAME_CATALOG`:

- `games[]` — список игр.
- `game.rates` — курсы валют для расчета.
- `game.defaultOptions` — дефолтные опции UI.
- `game.patches[]` — патчи игры.
- `patch.sources[]` — источники.
- `source.scalers[]` — универсальные динамические правила (`per_duration`) для расчета за день/неделю/цикл.

Это позволяет добавить новую игру без переписывания доменной логики.

## Текущие данные

- Оставлен только патч `1.0`.
- Учтены правки по `Daily Activity` и `Monthly Pass` до `10800`.
- Переключаемые источники:
  - `AIC Quota Exchange`
  - `Urgent Recruit`
  - `HH Dossier`
  - `BP 60+ Crates [M]/[L]`

Контрольный расчет для `1.0` (при включенных Monthly Pass + optional источниках, BP tier 1):

- `Total Character Pulls (No Basic): 309.6`

## Запуск

```bash
python -m http.server 5173
```

Открыть `http://localhost:5173`.

## Добавление новых патчей (owner-only)

- Рабочий источник данных: `src/data/patches.js`.
- Добавляйте новый патч только через PR/commit в репозиторий (не через UI).
- Для защиты "только я могу менять данные":
- Включите branch protection на `main`.
- Оставьте write-доступ только вашему GitHub-аккаунту.
- Отключите прямые push для остальных (только read).
- Пошаговый процесс: `docs/PATCH_WORKFLOW.md`.

Важно: в чистом frontend-приложении невозможно надежно ограничить редактирование данных "по паролю в браузере". Надежное owner-only изменение требует контроля доступа на уровне репозитория или backend API с авторизацией.

## Google Sheets Importer (Go)

Добавлен owner-only импортер: `tools/patchsync`.

- Кнопка в UI: `Sync Sheets` (дергает локальный сервис `http://127.0.0.1:8787/sync`).
- Генерируемый файл: `src/data/patches.generated.js`.
- Если в `patches.generated.js` есть патчи, они приоритетнее ручных в `src/data/patches.js`.

Запуск локального сервиса для кнопки:

```bash
go run ./tools/patchsync --serve
```

Разовый запуск без UI:

```bash
go run ./tools/patchsync --spreadsheet-id <ID> --sheet-names 1.0,1.1
```

`--spreadsheet-id` принимает как чистый ID, так и полный URL таблицы.

Опционально создавать ветку перед записью:

```bash
go run ./tools/patchsync --spreadsheet-id <ID> --sheet-names 1.0,1.1 --create-branch
```

Что ожидает парсер в листе:

- Название листа: `1.0`, `1.1`, `1.2` и т.д.
- Колонки: `Oroberyl`, `Origeometry`, `Chartered HH Permit`, `Basic HH Permit`, `Arsenal Tickets`.
- Секционные заголовки: `Events:`, `Permanent Content:`, `Mailbox & Web Events:`, `Recurring Sources:`.
- Для recurring источников используются строки:
  - `Daily Activity`
  - `Weekly Routine`
  - `Monumental Etching`
  - `AIC Quota Exchange` (или `AIC Quata Exchange`)
  - `Urgent Recruit`
  - `HH Dossier`
  - `Originium Supply Pass`
  - `Protocol Customized Pass`
  - `Monthly Pass`
  - `Exchange Crate-o-Surprise [M]`
  - `Exchange Crate-o-Surprise [L]`

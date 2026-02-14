# Endfield Bookkeeper

Простое веб-приложение для подсчета круток в Arknights: Endfield.

## Что уже реализовано

- Архитектура по слоям: `data`, `domain`, `ui`.
- Загрузка данных из локального JSON или Google Sheets CSV.
- Переключатель месячной подписки.
- 3 уровня Battle Pass:
  - `1` - F2P
  - `2` - за игровую донат-валюту
  - `3` - за реальные деньги
- Конвертер:
  - `1 Origeometry = 75 Oroberyl`
  - `1 Origeometry = 25 Arsenal Tickets`
  - `1 pull = 500 Oroberyl`
- График круток по номеру патча.

## Запуск

Нужен локальный статический сервер (fetch JSON не работает через `file://`).

Пример с Python:

```bash
python -m http.server 5173
```

Открыть: `http://localhost:5173`

## Данные

По умолчанию используется `src/data/patches.sample.json`.

### JSON формат (рекомендуется)

```json
[
  {
    "patch": "1.0",
    "base": {
      "oroberyl": 5100,
      "origeometry": 80,
      "chartered": 10,
      "basic": 5,
      "firewalker": 0,
      "messenger": 5,
      "hues": 0,
      "arsenal": 8
    },
    "monthlySub": {
      "oroberyl": 1800,
      "origeometry": 0,
      "chartered": 0,
      "basic": 0,
      "firewalker": 0,
      "messenger": 0,
      "hues": 0,
      "arsenal": 0
    },
    "battlePass": {
      "1": { "oroberyl": 1300, "origeometry": 0, "chartered": 1, "basic": 1, "firewalker": 0, "messenger": 0, "hues": 0, "arsenal": 1 },
      "2": { "oroberyl": 2200, "origeometry": 5, "chartered": 2, "basic": 1, "firewalker": 0, "messenger": 0, "hues": 0, "arsenal": 2 },
      "3": { "oroberyl": 3500, "origeometry": 10, "chartered": 3, "basic": 2, "firewalker": 0, "messenger": 0, "hues": 0, "arsenal": 3 }
    }
  }
]
```

### Google Sheets CSV формат

Заголовки должны совпадать с именами колонок:

`patch,oroberyl,origeometry,chartered,basic,firewalker,messenger,hues,arsenal,monthly_oroberyl,monthly_origeometry,monthly_chartered,monthly_basic,monthly_firewalker,monthly_messenger,monthly_hues,monthly_arsenal,bp1_oroberyl,bp1_origeometry,bp1_chartered,bp1_basic,bp1_firewalker,bp1_messenger,bp1_hues,bp1_arsenal,bp2_oroberyl,bp2_origeometry,bp2_chartered,bp2_basic,bp2_firewalker,bp2_messenger,bp2_hues,bp2_arsenal,bp3_oroberyl,bp3_origeometry,bp3_chartered,bp3_basic,bp3_firewalker,bp3_messenger,bp3_hues,bp3_arsenal`

Для Google Sheets используйте ссылку вида:

`https://docs.google.com/spreadsheets/d/<ID>/export?format=csv&gid=<GID>`

## Иконка и фон

Положите файлы:

- `assets/favicon.png`
- `assets/background.jpg`

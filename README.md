# Endfield Bookkeeper

Локальное веб-приложение для подсчета круток по патчу `1.0`.

## Текущая логика

- Patch: `1.0 (Zeroth Directive)`
- Start date: `22 Jan 2026`
- Duration: `54 days`
- F2P база:
  - `Oroberyl: 92266`
  - `Chartered HH Permit: 102`
  - `Basic HH Permit: 112`
  - `Origeometry: 156`
  - `Arsenal Tickets: 700`
- Monthly Pass:
  - `+200 Oroberyl/day`
  - `+12 Origeometry` one-time
- Battle Pass:
  - `1 - Basic Supply`
  - `2 - Originium Supply` (`-29 Origeometry`, `+32 Origeometry`)
  - `3 - Protocol Customized` (`+36 Origeometry`, `+2400 Arsenal Tickets`)
  - Tier 2 включает Tier 1, Tier 3 включает Tier 1+2+3.

## Запуск

```bash
python -m http.server 5173
```

Открыть `http://localhost:5173`.

## Файлы

- `index.html` — структура страницы
- `src/data/patches.js` — данные патча
- `src/domain/calculation.js` — расчет итогов
- `src/main.js` — связывание UI и расчетов
- `src/styles.css` — оформление и переключатели

# Разработка

## Требования

- Node.js (актуальная LTS)
- npm
- (опционально) Postgres, если хотите DB-режим

## Установка

```bash
npm install
cp .env.example .env.local
```

## Запуск

```bash
npm run dev
```

Открыть `http://localhost:3000`.

По умолчанию `.env.example` настроен на `DATA_SOURCE=json` (локальный MVP на `src/data/*.json`).
Для DB-режима настройте `DATABASE_URL`/`DIRECT_URL` и переключите `DATA_SOURCE=db` (или уберите `DATA_SOURCE`, чтобы включился авто-режим).

## Тесты / качество

```bash
npm run test
npm run lint
npm run typecheck
```

## База данных (Prisma)

Скрипты:

- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:seed`

Переменные окружения для DB-режима: см. `.env.example` и `docs/DATA_SOURCES.md`.

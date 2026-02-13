# AI Guide (Code Map)

Цель: дать ИИ-агенту короткий "путеводитель", чтобы не нужно было читать весь репозиторий.

## Что это за проект

Mia - витрина мультибрендового магазина на `Next.js (App Router) + TypeScript`.

Ключевая особенность: данные могут храниться либо в JSON-файлах (`src/data/*.json`), либо в Postgres через Prisma.

## Куда смотреть в первую очередь

- Точки входа UI:
  - `src/app/layout.tsx`
  - `src/app/page.tsx`
  - `src/app/catalog/page.tsx`
  - `src/app/product/[slug]/page.tsx`
  - `src/app/admin/page.tsx`
  - `src/app/admin/dashboard/page.tsx`
- API:
  - `src/app/api/products/route.ts`
  - `src/app/api/orders/route.ts`
  - `src/app/api/stores/route.ts`
  - `src/app/api/categories/route.ts`
  - `src/app/api/admin/login/route.ts`
  - `src/app/api/admin/logout/route.ts`
- Серверный слой данных (абстракция над JSON/DB):
  - `src/lib/server-data.ts` (barrel)
  - `src/lib/server-data/storage.ts` (выбор источника данных + JSON I/O)
  - `src/lib/server-data/products.ts`
  - `src/lib/server-data/orders.ts`
  - `src/lib/server-data/stores.ts`
- Конфиг данных/БД:
  - `src/lib/db.ts` (определяет режим `json|db`, dual-write)
  - `prisma/schema.prisma`
  - `prisma/seed.ts`
- Доменные типы и контракты:
  - `src/lib/types.ts`
  - `src/lib/validation.ts` (Zod схемы для API)

## Источники правды (важно)

- Типы доменной модели: `src/lib/types.ts`.
- Валидация API input: `src/lib/validation.ts`.
- Выбор режима хранилища:
  - `src/lib/db.ts`
  - `src/lib/server-data/storage.ts`
- В production локальная FS read-only, поэтому JSON-мутации недоступны:
  - см. `src/lib/server-data/storage.ts` (`writeJson()`, `shouldWriteToJson()`).
  - рекомендуемая стратегия: DB-режим.

## Инварианты и "острые" места

- `POST /api/orders` требует заголовок `Idempotency-Key` (иначе 400), чтобы не создавать дубли при ретраях.
- Админ-доступ реализован cookie-токеном:
  - cookie: `mia_admin_session` (`src/lib/auth.ts`).
- Валидация товара включает палитру разрешенных цветов:
  - см. `src/lib/admin-options.ts` и `src/lib/validation.ts` (hex должен совпадать).
- Поле `paymentMethod` содержит `"card"`, но в создании заказа включены только `"messenger" | "cash"`:
  - см. `src/lib/validation.ts`.
 - `.env.example` по умолчанию настроен на JSON-режим; DB env нужно добавлять осознанно.

## Как безопасно менять данные/схему

- Если добавляете поле в `Product/Order/...`:
  - обновите `src/lib/types.ts`;
  - обновите Zod схемы в `src/lib/validation.ts`;
  - обновите Prisma schema + миграцию (если поле должно быть в DB);
  - обновите конвертеры `src/lib/server-data/converters.ts`;
  - обновите JSON-файлы в `src/data/*.json` (если режим json используется).

## Переменные окружения (минимум)

- `ADMIN_PASSWORD`, `ADMIN_SECRET` - админ-доступ
- `NEXT_PUBLIC_SITE_URL` - базовый URL (sitemap/metadata)
- `NEXT_PUBLIC_YANDEX_MAPS_API_KEY` - карта в контактах (если используется)
- `DATA_SOURCE` - `json` или `db`
- `DUAL_WRITE` - `true`, если нужно писать одновременно в JSON и DB (dev)
- `DATABASE_URL`, `DIRECT_URL` - Postgres (Prisma)

## Где про это подробнее

- `ARCHITECTURE.md`
- `DATA_SOURCES.md`
- `API.md`
- `SCRIPTS.md`

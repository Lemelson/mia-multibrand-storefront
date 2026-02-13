# Архитектура

## Обзор

Проект построен на `Next.js 14` (App Router). Условно есть 3 слоя:

1. UI (страницы и компоненты) - `src/app/*`, `src/components/*`
2. API (Next route handlers) - `src/app/api/*`
3. Данные (единый слой доступа к данным, скрывающий JSON/DB) - `src/lib/server-data/*`

## Поток данных (упрощенно)

- Страницы / API вызывают функции из `src/lib/server-data.ts`.
- `src/lib/server-data/storage.ts` решает, читать/писать ли в JSON или в Postgres (Prisma).
- В DB-режиме данные `Product/Order/Store/Category` хранятся частично в JSON-полях (например `colorsJson`), но наружу всегда отдаются доменные типы из `src/lib/types.ts`.

## Где хранится бизнес-логика

- Фильтрация/сортировка каталога: `src/lib/catalog.ts`
- Валидация входных payload для API: `src/lib/validation.ts`
- Нормализация отображаемых полей товара: `src/lib/normalize-product.ts`
- Admin auth:
  - токен/секрет/пароль: `src/lib/auth.ts`
  - проверка сессии: `src/lib/admin-session.ts`

## Хранилище данных (JSON vs DB)

Два режима:

- `json`: данные читаются из `src/data/*.json`, записи идут в те же файлы.
- `db`: данные читаются/пишутся в Postgres через Prisma.

Выбор режима и правила production описаны в `DATA_SOURCES.md`.

## Prisma / DB

- Prisma schema: `prisma/schema.prisma`
- Миграции: `prisma/migrations/*`
- Seed: `prisma/seed.ts` (подхватывается через `npm run db:seed`)

## Тесты

Тесты написаны на Vitest и лежат в `src/__tests__/*`.


# Источники данных (JSON и Postgres)

## TL;DR

В проекте есть абстракция над источником данных: JSON-файлы для быстрого MVP и Postgres (Prisma) для production/масштабирования.

Ключевые файлы:

- режим и флаги: `src/lib/db.ts`
- правила чтения/записи: `src/lib/server-data/storage.ts`
- CRUD: `src/lib/server-data/*`
- Prisma schema: `prisma/schema.prisma`

## Режимы

### JSON режим

- Чтение: `src/data/products.json`, `src/data/orders.json`, `src/data/stores.json`, `src/data/categories.json`
- Запись: в те же файлы (только в dev, не в production)

Подходит для локальной разработки и простых демо.

### DB режим (Postgres + Prisma)

- Чтение/запись: через Prisma client (`@prisma/client`)
- Данные хранятся в таблицах `products`, `orders`, `stores`, `categories`

Подходит для Vercel production (локальная файловая система в рантайме read-only).

## Как выбирается режим

1. Переменная окружения `DATA_SOURCE`:
   - `json` или `db`
2. Если `DATA_SOURCE` не задан:
   - при наличии `DATABASE_URL` (или совместимых `POSTGRES_*` env) режим по умолчанию `db`
   - иначе `json`

См. `src/lib/db.ts` (`getDataSourceMode()`, `isDatabaseConfigured()`).

## Особенность production (Vercel)

В production (`NODE_ENV=production`) при наличии настроенной DB проект форсирует DB-режим независимо от `DATA_SOURCE`.

Причина: на Vercel filesystem read-only, JSON-запись невозможна, а чтение локальных файлов часто не является надежным источником данных для "живого" каталога.

См. `src/lib/server-data/storage.ts` (`shouldReadFromDb()`).

Если DB не настроена, чтение из JSON еще может работать (если файлы есть в сборке), но любые мутации (создание/редактирование товара, создание заказа) должны считаться недоступными.

## Dual-write (синхронизация JSON и DB)

Переменная `DUAL_WRITE=true` включает запись "в оба источника" в dev:

- если читаем из DB, можем дополнительно поддерживать JSON как "слепок"
- если читаем из JSON, можем upsert-ить записи в DB

Флаги:

- `DATA_SOURCE=db|json`
- `DUAL_WRITE=true|false`

См. `src/lib/db.ts` (`isDualWriteEnabled()`), `src/lib/server-data/storage.ts`.

## Переменные окружения (минимум)

- `DATABASE_URL` - URL подключения к Postgres (Prisma)
- `DIRECT_URL` - non-pooling URL (для миграций, когда нужен прямой коннект)
- `DATA_SOURCE` - `db` или `json`
- `DUAL_WRITE` - `true` чтобы писать и в JSON, и в DB (только dev)

Пример в `.env.example`.

## Типичные ошибки

- Скопировать `.env.example` и оставить фейковый `DATABASE_URL`.
  - Итог: приложение пытается ходить в DB и падает по коннекту.
  - Решение: либо используйте `DATA_SOURCE=json` без DB-переменных, либо поставьте реальные DB URL.

# API

API реализован через Next.js route handlers в `src/app/api/*`.

## Аутентификация админа

Сессия админа - это httpOnly cookie `mia_admin_session`.

- login: `POST /api/admin/login`
  - body: `{ "password": "..." }`
  - при успехе устанавливает cookie
- logout: `POST /api/admin/logout`
  - очищает cookie

Код:

- токен/проверка: `src/lib/auth.ts`
- проверка сессии: `src/lib/admin-session.ts`
- роуты: `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`

## Products

- `GET /api/products`
  - query: `gender`, `category`, `storeId`, `page`, `pageSize`
  - фильтры: `q`, `sizes`, `brands`, `colors`, `inStock=1`, `sale=1`, `sort`, `priceMin`, `priceMax`
- `POST /api/products` (admin)
- `GET /api/products/:id`
- `PATCH /api/products/:id` (admin)
- `DELETE /api/products/:id` (admin)

Валидация payload: `src/lib/validation.ts`.

## Orders

- `GET /api/orders` (admin)
- `POST /api/orders`
  - обязательный заголовок: `Idempotency-Key`
  - иначе: 400
- `PATCH /api/orders/:id` (admin) - смена статуса

Idempotency реализована на уровне `src/lib/server-data/orders.ts`:

- в DB-режиме: таблица `order_idempotency`
- в JSON-режиме: файл `src/data/order-idempotency.json` (создается при необходимости)

## Stores / Categories

- `GET /api/stores`
- `GET /api/categories`


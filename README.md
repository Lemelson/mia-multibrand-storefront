# Mia Multi-Brand Storefront

Локальный MVP интернет-магазина в стиле мультибрендового бутика на `Next.js + TypeScript + Tailwind CSS`.

Проект включает витрину, каталог, карточку товара, корзину, оформление заказа и админ-панель для управления товарами и заказами. Архитектура подготовлена для быстрого старта локально и дальнейшего деплоя на Vercel.

## Основные возможности

- Главная страница с hero-блоком, категориями, блоком новинок и брендов
- Каталог с фильтрами, сортировкой и пагинацией
- Карточка товара с галереей, выбором цвета/размера и рекомендациями
- Корзина + мини-корзина (drawer)
- Checkout с валидацией, выбором способа получения/оплаты, созданием заказа
- Проверка доступности товаров в выбранной точке выдачи
- Админ-панель с входом по паролю:
  - создание / редактирование / удаление товаров
  - управление видимостью товаров
  - управление статусами заказов
- SEO-база: `sitemap.xml`, `robots.txt`, metadata для страницы товара

## Технологии

- `Next.js 14` (App Router)
- `TypeScript`
- `Tailwind CSS`
- `Framer Motion`
- `Lucide React`
- `Prisma` + `PostgreSQL` (опционально; рекомендуется для production)

## Документация

- Индекс: [`docs/README.md`](docs/README.md)
- Короткая "карта" проекта для ИИ: [`docs/AI_GUIDE.md`](docs/AI_GUIDE.md)

## Структура проекта

```text
src/
  app/
    (storefront pages + api routes + admin pages)
  components/
    (UI и клиентские модули)
  data/
    products.json
    orders.json
    stores.json
    categories.json
  lib/
    (типы, форматирование, серверная логика, auth)
```

## Данные и хранилище

Проект поддерживает два режима данных: JSON и Postgres (Prisma).

JSON (подходит для быстрого MVP/локально):

- `src/data/products.json` - товары
- `src/data/orders.json` - заказы
- `src/data/stores.json` - точки выдачи/магазины
- `src/data/categories.json` - категории

DB (рекомендуется для production/Vercel):

- `prisma/schema.prisma` - схема БД
- `npm run db:migrate` - миграции
- `npm run db:seed` - сидинг из `src/data/*.json`

Подробнее: [`docs/DATA_SOURCES.md`](docs/DATA_SOURCES.md).

## Быстрый старт (локально)

1. Установить зависимости:

```bash
npm install
```

2. Создать env-файл:

```bash
cp .env.example .env.local
```

3. Запустить проект:

```bash
npm run dev
```

4. Открыть в браузере:

- `http://localhost:3000`

## Доступ в админ-панель

- URL: `/admin`
- Пароль по умолчанию: `mia-admin`

Для продакшена обязательно измените:

- `ADMIN_PASSWORD`
- `ADMIN_SECRET`

## Переменные окружения

См. `.env.example`:

```env
ADMIN_PASSWORD=mia-admin
ADMIN_SECRET=change-this-secret
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_YANDEX_MAPS_API_KEY=your-yandex-maps-api-key
NEXT_PUBLIC_DEV_ADMIN_PASSWORD=mia-admin
DATA_SOURCE=json
DUAL_WRITE=false
# DATABASE_URL=postgresql://...
# DIRECT_URL=postgresql://...
```

## NPM-скрипты

- `npm run dev` — локальная разработка
- `npm run build` — production build
- `npm run start` — запуск production-сборки
- `npm run lint` — eslint
- `npm run typecheck` — проверка TypeScript
- `npm run test` — тесты (vitest)
- `npm run db:migrate` — prisma migrate dev
- `npm run db:seed` — prisma db seed

## API (MVP)

- `GET /api/products` — список товаров для каталога (с фильтрацией)
- `POST /api/products` — создать товар (только admin)
- `GET /api/products/:id` — получить товар
- `PATCH /api/products/:id` — обновить товар (только admin)
- `DELETE /api/products/:id` — удалить товар (только admin)

- `GET /api/orders` — список заказов (только admin)
- `POST /api/orders` — создать заказ
- `PATCH /api/orders/:id` — сменить статус заказа (только admin)

- `POST /api/admin/login` — вход в админку
- `POST /api/admin/logout` — выход

## Деплой на Vercel

### Вариант A: через GitHub (рекомендуется)

1. Загрузить репозиторий на GitHub
2. В Vercel нажать `Add New Project`
3. Выбрать репозиторий
4. Добавить переменные окружения:
   - `ADMIN_PASSWORD`
   - `ADMIN_SECRET`
   - `NEXT_PUBLIC_SITE_URL` (URL проекта на Vercel)
5. Deploy

### Вариант B: через Vercel CLI

```bash
npm i -g vercel
vercel
```

Затем добавить env-переменные в настройках проекта на Vercel.

## Важно для production

- JSON-хранилище подходит для MVP/демо и локального запуска.
- На Vercel в production файловая система read-only, поэтому при настроенной БД проект читает/пишет через БД.
- Не храните реальные секреты в репозитории.
- Ограничьте доступ к админке и задайте сильный пароль.

## Лицензия

Частный проект (private/internal use).

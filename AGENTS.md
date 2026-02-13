# Инструкции для ИИ-агентов

Цель: помочь быстро ориентироваться в кодовой базе без загрузки всего репозитория в контекст.

## Стартовая точка

1. Прочитать `docs/AI_GUIDE.md` (карта проекта).
2. При изменениях данных/контрактов сверяться с:
   - `src/lib/types.ts` (доменные типы)
   - `src/lib/validation.ts` (Zod контракты API)
   - `src/lib/server-data/*` (реальная логика чтения/записи)

## Источники правды

- Контракты доменных сущностей: `src/lib/types.ts`
- Валидация входных payload: `src/lib/validation.ts`
- Режим хранилища и правила production: `src/lib/db.ts`, `src/lib/server-data/storage.ts`
- Prisma schema: `prisma/schema.prisma`

## Инварианты (важно не ломать)

- `POST /api/orders` требует `Idempotency-Key`, иначе 400.
- В production JSON-файлы не являются надежным persistent storage (read-only FS), мутации должны идти через DB.
- Админ-сессия это httpOnly cookie `mia_admin_session` (см. `src/lib/auth.ts`).
- Палитра цветов в товарах ограничена (см. `src/lib/admin-options.ts` + `src/lib/validation.ts`).

## Где что лежит

- UI страницы: `src/app/*`
- UI компоненты: `src/components/*`
- API: `src/app/api/*`
- Серверный слой данных (JSON/DB): `src/lib/server-data/*`
- JSON данные (dev/MVP): `src/data/*.json`
- DB: `prisma/*`
- Скрипты импорта/нормализации: `scripts/*`

## Документация

- Индекс: `docs/README.md`
- Архитектура: `docs/ARCHITECTURE.md`
- Источники данных: `docs/DATA_SOURCES.md`
- API: `docs/API.md`
- Разработка: `docs/DEVELOPMENT.md`
- Скрипты: `docs/SCRIPTS.md`
- ADR: `docs/DECISIONS/*`

## Локальная документация

Некоторые документы/заметки могут быть локальными и не коммититься (см. `.gitignore`, папка `docs-local/`).


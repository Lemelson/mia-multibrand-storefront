# Scripts

В `scripts/` лежат утилиты для импорта и подготовки данных (в основном для каталога и медиа).

Важно:

- `outputs/` игнорируется `.gitignore` (чтобы не раздувать репозиторий).
- многие скрипты ожидают входные файлы в `outputs/...` и записывают результат туда же.

## Max Mara

- `scripts/import-maxmara-online-fashion.mjs`
  - импортирует карточки из `outputs/maxmara/*.json` в `src/data/products.json`
  - локализует изображения в `public/media/products/...`
- `scripts/normalize-maxmara-products.mjs`
  - нормализация данных (названия/состав и т.п.)
- `scripts/sync-maxmara-products-to-db.mjs`
  - синхронизирует Max Mara товары из `src/data/products.json` в Postgres
  - полезно, когда production читает из DB

## Twinset

- `scripts/import-twinset-ru-fallback.mjs`
  - импортирует результат парсинга (обычно `outputs/twinset_ru_fallback_full/*.json`) в `src/data/products.json`
  - умеет (опционально) писать напрямую в DB, если `DATA_SOURCE=db` и настроен `DATABASE_URL`

### Индексация сайта (локальный краулер)

- `scripts/twinset_site_indexer.py`
  - строит локальный индекс `site + sku + product_url` в SQLite
  - полезно для нахождения URL по артикулам и для ретраев "blocked/error"
- `scripts/TWINSET_INDEXER_USAGE.md`
  - примеры запуска (smoke/full/retry/match excel)

## Локализация изображений

- `scripts/localize-maxmara-images.mjs`
- `scripts/localize-twinset-images.mjs`

Смысл: привести изображения к предсказуемой структуре в `public/media/products/...`, чтобы UI работал без внешних URL.

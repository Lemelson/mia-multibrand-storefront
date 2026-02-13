# Twinset Full-Site Indexer Usage

Script path:

`scripts/twinset_site_indexer.py`

It builds a local SQLite index: `site + sku + product_url`, supports resume, logs, and exports CSV.

## 1) Smoke test (short run)

```bash
cd /path/to/ModaMia-Codex-2
python3 scripts/twinset_site_indexer.py crawl \
  --site both \
  --db-path outputs/site_index/smoke.db \
  --log-path outputs/site_index/smoke.log \
  --export-dir outputs/site_index/smoke_exports \
  --max-sitemaps 4 \
  --max-pages 40 \
  --delay-min 0.15 \
  --delay-max 0.35 \
  --verbose
```

## 2) Full run (long)

```bash
cd /path/to/ModaMia-Codex-2
python3 scripts/twinset_site_indexer.py crawl \
  --site both \
  --db-path outputs/site_index/twinset_index.db \
  --log-path outputs/site_index/twinset_index.log \
  --export-dir outputs/site_index/exports \
  --max-depth 2 \
  --delay-min 0.8 \
  --delay-max 1.8 \
  --verbose
```

Notes:
- Safe speed defaults for fewer blocks.
- If interrupted, just run the same command again; it resumes from DB.

## 3) Retry only error/blocked URLs

```bash
cd /path/to/ModaMia-Codex-2
python3 scripts/twinset_site_indexer.py crawl \
  --site both \
  --db-path outputs/site_index/twinset_index.db \
  --log-path outputs/site_index/twinset_index.log \
  --export-dir outputs/site_index/exports \
  --retry-errors \
  --delay-min 1.0 \
  --delay-max 2.2 \
  --verbose
```

## 4) Match Excel articles against index

```bash
cd /path/to/ModaMia-Codex-2
python3 scripts/twinset_site_indexer.py match \
  --db-path outputs/site_index/twinset_index.db \
  --log-path outputs/site_index/twinset_index.log \
  --export-dir outputs/site_index/match_excel \
  --xlsx "Boxes Pyatibratova.xlsx" \
  --sheet "ASS_013B" \
  --part-column "Parte" \
  --verbose
```

Outputs:
- `outputs/site_index/match_excel/articles_found.csv`
- `outputs/site_index/match_excel/articles_missing.csv`
- `outputs/site_index/match_excel/articles_summary.json`

## 5) Cookies (optional)

If needed for access/session:

```bash
python3 scripts/twinset_site_indexer.py crawl ... --cookie-file /path/to/cookies.txt
```

or

```bash
python3 scripts/twinset_site_indexer.py crawl ... --cookie-header "name=value; name2=value2"
```

## 6) Where to watch progress/errors

- Live terminal output with `--verbose`
- Full log file: `outputs/site_index/twinset_index.log`
- URL-level errors CSV: `outputs/site_index/exports/url_errors.csv`
- Index CSV: `outputs/site_index/exports/sku_index.csv`

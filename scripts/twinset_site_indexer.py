#!/usr/bin/env python3
"""
Twinset site indexer (twinset.ru + twinset.com).

Purpose:
- Crawl sitemap + category pages.
- Build durable local index: site, SKU, product URL.
- Persist progress in SQLite to support resume/retry.
- Export CSV/JSON reports and "found/not-found" vs Excel list.

No external Python dependencies required.
"""

from __future__ import annotations

import argparse
import csv
import gzip
import html
import json
import random
import re
import sqlite3
import sys
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import HTTPCookieProcessor, Request, build_opener
import http.cookiejar


DEFAULT_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value).strip()


def strip_tags(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", " ", value)
    return normalize_space(html.unescape(value))


def strip_query_and_fragment(url: str) -> str:
    parsed = urlparse(url)
    clean = parsed._replace(query="", fragment="")
    normalized = clean.geturl()
    if normalized.endswith("/") and parsed.netloc.endswith("twinset.com") and normalized.count("/") > 3:
        normalized = normalized[:-1]
    return normalized


def dedupe_keep_order(values: Iterable[str]) -> List[str]:
    out: List[str] = []
    seen = set()
    for value in values:
        if not value:
            continue
        if value in seen:
            continue
        seen.add(value)
        out.append(value)
    return out


def safe_exc(exc: Exception) -> str:
    text = str(exc)
    return normalize_space(text)[:1200]


def detect_block_page(page_html: str) -> bool:
    lowered = page_html.lower()
    markers = [
        "attention required!",
        "cf-challenge",
        "verify you are a human",
        "captcha",
        "access denied",
        "temporarily unavailable",
    ]
    score = sum(1 for marker in markers if marker in lowered)
    return score >= 2 or "cf-challenge" in lowered


def extract_first(pattern: str, text: str, flags: int = 0) -> Optional[str]:
    match = re.search(pattern, text, flags)
    if not match:
        return None
    return match.group(1)


def extract_js_value(page_html: str, marker: str) -> Optional[str]:
    start_marker = page_html.find(marker)
    if start_marker < 0:
        return None

    idx = start_marker + len(marker)
    length = len(page_html)
    while idx < length and page_html[idx].isspace():
        idx += 1

    if idx >= length:
        return None

    open_ch = page_html[idx]
    close_ch = {"{": "}", "[": "]"}.get(open_ch)
    if not close_ch:
        return None

    depth = 0
    in_string = False
    escaped = False
    quote_char = ""

    for pos in range(idx, length):
        ch = page_html[pos]

        if in_string:
            if escaped:
                escaped = False
                continue
            if ch == "\\":
                escaped = True
                continue
            if ch == quote_char:
                in_string = False
                quote_char = ""
            continue

        if ch == "'" or ch == '"':
            in_string = True
            quote_char = ch
            continue

        if ch == open_ch:
            depth += 1
            continue

        if ch == close_ch:
            depth -= 1
            if depth == 0:
                return page_html[idx : pos + 1]

    return None


def extract_links(page_html: str, page_url: str) -> List[str]:
    hrefs = re.findall(r'href="([^"]+)"', page_html, flags=re.IGNORECASE)
    out: List[str] = []
    for href in hrefs:
        href = href.strip()
        if not href:
            continue
        if href.startswith("#") or href.startswith("javascript:") or href.startswith("mailto:") or href.startswith("tel:"):
            continue
        abs_url = urljoin(page_url, html.unescape(href))
        out.append(strip_query_and_fragment(abs_url))
    return dedupe_keep_order(out)


@dataclass(frozen=True)
class SiteConfig:
    key: str
    base_url: str
    sitemap_candidates: List[str]
    seed_category_urls: List[str]
    product_url_re: re.Pattern[str]
    category_url_re: re.Pattern[str]


SITE_CONFIGS: Dict[str, SiteConfig] = {
    "twinset.ru": SiteConfig(
        key="twinset.ru",
        base_url="https://twinset.ru",
        sitemap_candidates=[
            "https://twinset.ru/sitemap.xml",
            "https://twinset.ru/robots.txt",
        ],
        seed_category_urls=[
            "https://twinset.ru/catalog/",
        ],
        product_url_re=re.compile(r"^https://twinset\.ru/catalog/.+/\d+/?$", re.IGNORECASE),
        category_url_re=re.compile(r"^https://twinset\.ru/catalog(?:/.*)?/?$", re.IGNORECASE),
    ),
    "twinset.com": SiteConfig(
        key="twinset.com",
        base_url="https://www.twinset.com",
        sitemap_candidates=[
            "https://www.twinset.com/sitemap_index.xml",
            "https://www.twinset.com/robots.txt",
        ],
        seed_category_urls=[
            "https://www.twinset.com/row/",
        ],
        product_url_re=re.compile(
            r"^https://www\.twinset\.com/(?:row|[a-z]{2}(?:-[a-z]{2})?)/.+\.html$",
            re.IGNORECASE,
        ),
        category_url_re=re.compile(
            r"^https://www\.twinset\.com/(?:row|[a-z]{2}(?:-[a-z]{2})?)/(?:|women.*|man.*|child.*|sale.*|new.*|collection.*)$",
            re.IGNORECASE,
        ),
    ),
}


class LogWriter:
    def __init__(self, path: Path, verbose: bool) -> None:
        self.path = path
        self.verbose = verbose
        self.path.parent.mkdir(parents=True, exist_ok=True)

    def write(self, level: str, message: str) -> None:
        line = f"{now_iso()} [{level}] {message}"
        with self.path.open("a", encoding="utf-8") as fp:
            fp.write(line + "\n")
        if self.verbose:
            print(line, flush=True)

    def info(self, message: str) -> None:
        self.write("INFO", message)

    def warn(self, message: str) -> None:
        self.write("WARN", message)

    def error(self, message: str) -> None:
        self.write("ERROR", message)


class SimpleHttpClient:
    def __init__(
        self,
        timeout: float,
        retries: int,
        user_agent: str,
        cookie_header: Optional[str],
        cookie_file: Optional[Path],
    ) -> None:
        self.timeout = timeout
        self.retries = retries
        self.user_agent = user_agent
        self.cookie_header = cookie_header

        cookie_jar: http.cookiejar.CookieJar = http.cookiejar.CookieJar()
        if cookie_file and cookie_file.exists():
            try:
                mozilla_jar = http.cookiejar.MozillaCookieJar(str(cookie_file))
                mozilla_jar.load(ignore_discard=True, ignore_expires=True)
                cookie_jar = mozilla_jar
            except Exception:
                pass

        self.opener = build_opener(HTTPCookieProcessor(cookie_jar))

    def get_bytes(self, url: str) -> Tuple[bytes, Dict[str, str]]:
        headers = {
            "User-Agent": self.user_agent,
            "Accept": "*/*",
            "Accept-Language": "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7",
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
        }
        if self.cookie_header:
            headers["Cookie"] = self.cookie_header

        last_error: Optional[Exception] = None
        for attempt in range(1, self.retries + 1):
            req = Request(url, headers=headers)
            try:
                with self.opener.open(req, timeout=self.timeout) as resp:
                    raw = resp.read()
                    resp_headers = {k.lower(): v for k, v in resp.headers.items()}
                    return raw, resp_headers
            except HTTPError as exc:
                # Preserve HTTP status for caller (404/429/403 handling).
                if attempt >= self.retries:
                    raise
                last_error = exc
                time.sleep(1.2 * attempt)
            except (URLError, TimeoutError, ConnectionError) as exc:
                last_error = exc
                if attempt >= self.retries:
                    break
                time.sleep(1.2 * attempt)
        raise RuntimeError(f"HTTP failed for {url}: {last_error}")

    def get_text(self, url: str) -> Tuple[str, Dict[str, str]]:
        raw, headers = self.get_bytes(url)
        charset = "utf-8"
        ctype = headers.get("content-type", "")
        m = re.search(r"charset=([a-zA-Z0-9._-]+)", ctype)
        if m:
            charset = m.group(1).strip()
        return raw.decode(charset, errors="ignore"), headers


class IndexDb:
    def __init__(self, db_path: Path) -> None:
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(str(db_path))
        self.conn.execute("PRAGMA journal_mode=WAL;")
        self.conn.execute("PRAGMA synchronous=NORMAL;")
        self.conn.row_factory = sqlite3.Row
        self._init_schema()

    def _init_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS sitemaps (
                site TEXT NOT NULL,
                url TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                discovered_from TEXT,
                item_count INTEGER,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (site, url)
            );

            CREATE TABLE IF NOT EXISTS url_queue (
                site TEXT NOT NULL,
                url TEXT NOT NULL,
                url_type TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'pending',
                depth INTEGER NOT NULL DEFAULT 0,
                discovered_from TEXT,
                attempts INTEGER NOT NULL DEFAULT 0,
                last_http_status INTEGER,
                blocked INTEGER NOT NULL DEFAULT 0,
                last_error TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (site, url)
            );

            CREATE TABLE IF NOT EXISTS products (
                site TEXT NOT NULL,
                url TEXT NOT NULL,
                sku TEXT,
                title TEXT,
                category_path TEXT,
                payload_json TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (site, url)
            );

            CREATE TABLE IF NOT EXISTS sku_index (
                site TEXT NOT NULL,
                sku TEXT NOT NULL,
                url TEXT NOT NULL,
                title TEXT,
                category_path TEXT,
                updated_at TEXT NOT NULL,
                PRIMARY KEY (site, sku, url)
            );
            """
        )
        self.conn.commit()

    def close(self) -> None:
        self.conn.close()

    def enqueue_sitemap(self, site: str, url: str, discovered_from: Optional[str]) -> None:
        self.conn.execute(
            """
            INSERT INTO sitemaps(site, url, status, discovered_from, updated_at)
            VALUES (?, ?, 'pending', ?, ?)
            ON CONFLICT(site, url) DO NOTHING
            """,
            (site, url, discovered_from, now_iso()),
        )

    def set_sitemap_status(
        self,
        site: str,
        url: str,
        status: str,
        item_count: Optional[int] = None,
        error: Optional[str] = None,
    ) -> None:
        self.conn.execute(
            """
            UPDATE sitemaps
            SET status = ?,
                item_count = COALESCE(?, item_count),
                attempts = attempts + 1,
                last_error = ?,
                updated_at = ?
            WHERE site = ? AND url = ?
            """,
            (status, item_count, error, now_iso(), site, url),
        )

    def next_pending_sitemap(self, site: str) -> Optional[str]:
        row = self.conn.execute(
            """
            SELECT url
            FROM sitemaps
            WHERE site = ? AND status = 'pending'
            ORDER BY attempts ASC, updated_at ASC
            LIMIT 1
            """,
            (site,),
        ).fetchone()
        if not row:
            return None
        return str(row["url"])

    def enqueue_url(
        self,
        site: str,
        url: str,
        url_type: str,
        depth: int,
        discovered_from: Optional[str],
    ) -> None:
        self.conn.execute(
            """
            INSERT INTO url_queue(site, url, url_type, status, depth, discovered_from, updated_at)
            VALUES (?, ?, ?, 'pending', ?, ?, ?)
            ON CONFLICT(site, url) DO NOTHING
            """,
            (site, url, url_type, depth, discovered_from, now_iso()),
        )

    def next_pending_url(self, site: str, allowed_types: Sequence[str], max_depth: int) -> Optional[sqlite3.Row]:
        placeholders = ",".join("?" for _ in allowed_types)
        params: List[Any] = [site, *allowed_types, max_depth]
        row = self.conn.execute(
            f"""
            SELECT *
            FROM url_queue
            WHERE site = ?
              AND status = 'pending'
              AND url_type IN ({placeholders})
              AND depth <= ?
            ORDER BY depth ASC, attempts ASC, updated_at ASC
            LIMIT 1
            """,
            params,
        ).fetchone()
        return row

    def set_url_status(
        self,
        site: str,
        url: str,
        status: str,
        http_status: Optional[int] = None,
        blocked: bool = False,
        error: Optional[str] = None,
    ) -> None:
        self.conn.execute(
            """
            UPDATE url_queue
            SET status = ?,
                attempts = attempts + 1,
                last_http_status = COALESCE(?, last_http_status),
                blocked = ?,
                last_error = ?,
                updated_at = ?
            WHERE site = ? AND url = ?
            """,
            (status, http_status, 1 if blocked else 0, error, now_iso(), site, url),
        )

    def upsert_product(
        self,
        site: str,
        url: str,
        sku: Optional[str],
        title: Optional[str],
        category_path: Optional[str],
        payload: Dict[str, Any],
    ) -> None:
        payload_json = json.dumps(payload, ensure_ascii=False)
        self.conn.execute(
            """
            INSERT INTO products(site, url, sku, title, category_path, payload_json, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(site, url) DO UPDATE SET
                sku = excluded.sku,
                title = excluded.title,
                category_path = excluded.category_path,
                payload_json = excluded.payload_json,
                updated_at = excluded.updated_at
            """,
            (site, url, sku, title, category_path, payload_json, now_iso()),
        )
        if sku:
            self.conn.execute(
                """
                INSERT INTO sku_index(site, sku, url, title, category_path, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(site, sku, url) DO UPDATE SET
                    title = excluded.title,
                    category_path = excluded.category_path,
                    updated_at = excluded.updated_at
                """,
                (site, sku, url, title, category_path, now_iso()),
            )

    def reset_errors(self, site: str) -> int:
        cur = self.conn.execute(
            """
            UPDATE url_queue
            SET status = 'pending', last_error = NULL, blocked = 0, updated_at = ?
            WHERE site = ? AND status IN ('error', 'blocked')
            """,
            (now_iso(), site),
        )
        return int(cur.rowcount)

    def stats(self, site: str) -> Dict[str, Any]:
        stats: Dict[str, Any] = {}

        for table, key in (("sitemaps", "sitemaps"), ("url_queue", "url_queue")):
            rows = self.conn.execute(
                f"SELECT status, COUNT(*) c FROM {table} WHERE site = ? GROUP BY status",
                (site,),
            ).fetchall()
            stats[key] = {str(row["status"]): int(row["c"]) for row in rows}

        products_count = self.conn.execute(
            "SELECT COUNT(*) c FROM products WHERE site = ? AND sku IS NOT NULL AND sku != ''",
            (site,),
        ).fetchone()
        sku_count = self.conn.execute(
            "SELECT COUNT(DISTINCT sku) c FROM sku_index WHERE site = ?",
            (site,),
        ).fetchone()
        stats["products_with_sku"] = int(products_count["c"]) if products_count else 0
        stats["distinct_skus"] = int(sku_count["c"]) if sku_count else 0
        return stats

    def export_csv(self, export_dir: Path) -> Dict[str, str]:
        export_dir.mkdir(parents=True, exist_ok=True)
        sku_csv = export_dir / "sku_index.csv"
        errors_csv = export_dir / "url_errors.csv"

        with sku_csv.open("w", encoding="utf-8", newline="") as fp:
            writer = csv.DictWriter(fp, fieldnames=["site", "sku", "url", "title", "category_path", "updated_at"])
            writer.writeheader()
            rows = self.conn.execute(
                """
                SELECT site, sku, url, title, category_path, updated_at
                FROM sku_index
                ORDER BY site, sku, updated_at DESC
                """
            ).fetchall()
            for row in rows:
                writer.writerow(dict(row))

        with errors_csv.open("w", encoding="utf-8", newline="") as fp:
            writer = csv.DictWriter(
                fp,
                fieldnames=[
                    "site",
                    "url",
                    "url_type",
                    "status",
                    "attempts",
                    "blocked",
                    "last_http_status",
                    "last_error",
                    "updated_at",
                ],
            )
            writer.writeheader()
            rows = self.conn.execute(
                """
                SELECT site, url, url_type, status, attempts, blocked, last_http_status, last_error, updated_at
                FROM url_queue
                WHERE status IN ('error', 'blocked')
                ORDER BY updated_at DESC
                """
            ).fetchall()
            for row in rows:
                writer.writerow(dict(row))

        return {"sku_index_csv": str(sku_csv), "errors_csv": str(errors_csv)}

    def match_articles(self, articles: Sequence[str], export_dir: Path) -> Dict[str, str]:
        export_dir.mkdir(parents=True, exist_ok=True)
        found_path = export_dir / "articles_found.csv"
        missing_path = export_dir / "articles_missing.csv"
        summary_path = export_dir / "articles_summary.json"

        cleaned = [normalize_space(a).upper() for a in articles if normalize_space(a)]
        cleaned = dedupe_keep_order(cleaned)

        found_rows: List[Dict[str, Any]] = []
        missing_rows: List[Dict[str, Any]] = []

        for article in cleaned:
            rows = self.conn.execute(
                """
                SELECT site, sku, url, title, category_path, updated_at
                FROM sku_index
                WHERE sku = ?
                ORDER BY updated_at DESC
                """,
                (article,),
            ).fetchall()
            if not rows:
                missing_rows.append({"article": article})
                continue
            for row in rows:
                found_rows.append(
                    {
                        "article": article,
                        "site": row["site"],
                        "url": row["url"],
                        "title": row["title"],
                        "category_path": row["category_path"],
                        "updated_at": row["updated_at"],
                    }
                )

        with found_path.open("w", encoding="utf-8", newline="") as fp:
            writer = csv.DictWriter(
                fp,
                fieldnames=["article", "site", "url", "title", "category_path", "updated_at"],
            )
            writer.writeheader()
            writer.writerows(found_rows)

        with missing_path.open("w", encoding="utf-8", newline="") as fp:
            writer = csv.DictWriter(fp, fieldnames=["article"])
            writer.writeheader()
            writer.writerows(missing_rows)

        summary = {
            "total_articles": len(cleaned),
            "found_articles": len(cleaned) - len(missing_rows),
            "missing_articles": len(missing_rows),
            "generated_at": now_iso(),
            "found_csv": str(found_path),
            "missing_csv": str(missing_path),
        }
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        return {
            "found_csv": str(found_path),
            "missing_csv": str(missing_path),
            "summary_json": str(summary_path),
        }

    def commit(self) -> None:
        self.conn.commit()


def parse_robots_for_sitemaps(robots_text: str) -> List[str]:
    out: List[str] = []
    for line in robots_text.splitlines():
        line_clean = line.strip()
        if not line_clean.lower().startswith("sitemap:"):
            continue
        url = normalize_space(line_clean.split(":", 1)[1])
        if url:
            out.append(url)
    return dedupe_keep_order(out)


def parse_sitemap_locs(raw_bytes: bytes, source_url: str) -> List[str]:
    payload = raw_bytes
    if source_url.lower().endswith(".gz"):
        payload = gzip.decompress(payload)
    else:
        try:
            if payload[:2] == b"\x1f\x8b":
                payload = gzip.decompress(payload)
        except Exception:
            pass

    root = ET.fromstring(payload)
    locs: List[str] = []
    for elem in root.iter():
        tag = elem.tag.rsplit("}", 1)[-1]
        if tag != "loc":
            continue
        if elem.text:
            locs.append(normalize_space(elem.text))
    return dedupe_keep_order(locs)


def classify_url(site_cfg: SiteConfig, url: str) -> str:
    clean = strip_query_and_fragment(url)
    if site_cfg.key == "twinset.ru":
        # Common stale sitemap pattern on bitrix sites; these are often gone (404).
        if re.match(r"^https://twinset\.ru/catalog/\d+/?$", clean, flags=re.IGNORECASE):
            return "other"
    if site_cfg.product_url_re.match(clean):
        if site_cfg.key == "twinset.com":
            if extract_twinset_com_sku_from_url(clean):
                return "product"
            return "category"
        return "product"
    if site_cfg.category_url_re.match(clean):
        return "category"
    return "other"


def extract_twinset_com_sku_from_url(url: str) -> Optional[str]:
    m = re.search(
        r"-([0-9]{3}[A-Z]{2,5}[0-9A-Z]{2,})(?:_[0-9A-Z]+)?\.html$",
        url,
        flags=re.IGNORECASE,
    )
    if not m:
        return None
    return m.group(1).upper()


def parse_twinset_ru_product(page_html: str, page_url: str) -> Dict[str, Optional[str]]:
    raw = extract_js_value(page_html, "window.vueProduct =")
    sku = None
    title = None
    category_path = None

    if raw:
        try:
            parsed = json.loads(raw)
            root = parsed[0] if isinstance(parsed, list) and parsed and isinstance(parsed[0], dict) else parsed
            if isinstance(root, dict):
                colors = root.get("colors") if isinstance(root.get("colors"), list) else []
                selected_color_id = root.get("selectedColorId")
                selected: Dict[str, Any] = {}
                for color in colors:
                    if not isinstance(color, dict):
                        continue
                    if selected_color_id is not None and color.get("id") == selected_color_id:
                        selected = color
                        break
                if not selected and colors and isinstance(colors[0], dict):
                    selected = colors[0]

                title = normalize_space(str(selected.get("title", "") or root.get("name", ""))) or None

                offers = selected.get("offers") if isinstance(selected.get("offers"), list) else []
                for offer in offers:
                    if not isinstance(offer, dict):
                        continue
                    vendor = normalize_space(str(offer.get("vendor", ""))).upper()
                    if vendor:
                        sku = vendor
                        break

                breadcrumbs = root.get("breadcrumbs") if isinstance(root.get("breadcrumbs"), list) else []
                crumb_titles = []
                for item in breadcrumbs:
                    if not isinstance(item, dict):
                        continue
                    t = normalize_space(str(item.get("title", "")))
                    if t:
                        crumb_titles.append(t)
                if crumb_titles:
                    category_path = " > ".join(crumb_titles)
        except Exception:
            pass

    if not sku:
        m = extract_first(r"Код\s*товара\s*:\s*([A-Z0-9]+)", page_html, flags=re.IGNORECASE)
        if m:
            sku = normalize_space(m).upper()

    if not title:
        h1 = extract_first(r"<h1[^>]*>([\s\S]*?)</h1>", page_html, flags=re.IGNORECASE)
        title = normalize_space(strip_tags(h1 or "")) or None

    return {"sku": sku, "title": title, "category_path": category_path, "url": page_url}


def parse_twinset_com_product(page_html: str, page_url: str) -> Dict[str, Optional[str]]:
    sku = extract_twinset_com_sku_from_url(page_url)
    title = None
    category_path = None

    h1 = extract_first(r"<h1[^>]*>([\s\S]*?)</h1>", page_html, flags=re.IGNORECASE)
    if h1:
        title = normalize_space(strip_tags(h1))

    if not sku:
        m = extract_first(
            r'Product code:\s*<span class="value">([^<]+)</span>',
            page_html,
            flags=re.IGNORECASE,
        )
        if m:
            sku = normalize_space(m).upper()

    crumbs = re.findall(
        r'<li[^>]*class="[^"]*breadcrumb-item[^"]*"[^>]*>([\s\S]*?)</li>',
        page_html,
        flags=re.IGNORECASE,
    )
    crumb_texts = [normalize_space(strip_tags(item)) for item in crumbs]
    crumb_texts = [item for item in crumb_texts if item]
    if crumb_texts:
        category_path = " > ".join(crumb_texts)

    return {"sku": sku, "title": title, "category_path": category_path, "url": page_url}


def parse_product(site_key: str, page_html: str, page_url: str) -> Dict[str, Optional[str]]:
    if site_key == "twinset.ru":
        return parse_twinset_ru_product(page_html, page_url)
    if site_key == "twinset.com":
        return parse_twinset_com_product(page_html, page_url)
    return {"sku": None, "title": None, "category_path": None, "url": page_url}


def load_articles_from_csv(csv_path: Path, column: str = "article") -> List[str]:
    if not csv_path.exists():
        raise RuntimeError(f"CSV not found: {csv_path}")
    with csv_path.open("r", encoding="utf-8-sig", newline="") as fp:
        reader = csv.DictReader(fp)
        if not reader.fieldnames:
            return []
        col = column if column in reader.fieldnames else reader.fieldnames[0]
        out = []
        for row in reader:
            value = normalize_space(row.get(col, ""))
            if value:
                out.append(value.upper())
        return dedupe_keep_order(out)


def load_articles_from_xlsx(xlsx_path: Path, sheet: Optional[str], part_column: str = "Parte") -> List[str]:
    sys.path.append(str(Path(__file__).resolve().parents[1] / "parsers" / "twinset"))
    try:
        from twinset_parser import build_article_rows  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"Unable to import Excel parser from twinset_parser.py: {exc}") from exc

    rows = build_article_rows(
        xlsx_path=xlsx_path,
        sheet_name=sheet,
        articles_cli=None,
        part_column=part_column,
        color_code_column="Colore",
        color_name_column="Des. Colore",
    )
    out = []
    for row in rows:
        article = normalize_space(str(row.get("article", "")))
        if article:
            out.append(article.upper())
    return dedupe_keep_order(out)


def crawl_sitemaps(
    db: IndexDb,
    client: SimpleHttpClient,
    site_cfg: SiteConfig,
    logger: LogWriter,
    delay_min: float,
    delay_max: float,
    max_sitemaps: Optional[int],
) -> int:
    for candidate in site_cfg.sitemap_candidates:
        if candidate.endswith("robots.txt"):
            try:
                text, _ = client.get_text(candidate)
                for sitemap_url in parse_robots_for_sitemaps(text):
                    db.enqueue_sitemap(site_cfg.key, strip_query_and_fragment(sitemap_url), candidate)
            except Exception as exc:
                logger.warn(f"{site_cfg.key} robots read failed: {safe_exc(exc)}")
        else:
            db.enqueue_sitemap(site_cfg.key, strip_query_and_fragment(candidate), None)
    db.commit()

    processed = 0
    while True:
        if max_sitemaps is not None and processed >= max_sitemaps:
            break

        next_url = db.next_pending_sitemap(site_cfg.key)
        if not next_url:
            break

        try:
            raw, _headers = client.get_bytes(next_url)
            locs = parse_sitemap_locs(raw, next_url)
            item_count = len(locs)
            nested = 0
            leaf = 0

            for loc in locs:
                clean = strip_query_and_fragment(loc)
                if clean.lower().endswith(".xml") or clean.lower().endswith(".xml.gz"):
                    db.enqueue_sitemap(site_cfg.key, clean, next_url)
                    nested += 1
                    continue

                url_type = classify_url(site_cfg, clean)
                if url_type in {"product", "category"}:
                    db.enqueue_url(site_cfg.key, clean, url_type, depth=0, discovered_from=next_url)
                    leaf += 1

            db.set_sitemap_status(site_cfg.key, next_url, "done", item_count=item_count, error=None)
            db.commit()
            processed += 1
            logger.info(
                f"{site_cfg.key} sitemap done: {next_url} (locs={item_count}, nested={nested}, queued={leaf})"
            )
        except Exception as exc:
            db.set_sitemap_status(site_cfg.key, next_url, "error", item_count=None, error=safe_exc(exc))
            db.commit()
            logger.warn(f"{site_cfg.key} sitemap error: {next_url} :: {safe_exc(exc)}")

        if delay_max > 0:
            time.sleep(random.uniform(delay_min, delay_max))

    return processed


def crawl_urls(
    db: IndexDb,
    client: SimpleHttpClient,
    site_cfg: SiteConfig,
    logger: LogWriter,
    delay_min: float,
    delay_max: float,
    max_pages: Optional[int],
    max_depth: int,
    discover_links: bool,
) -> int:
    for seed in site_cfg.seed_category_urls:
        db.enqueue_url(site_cfg.key, strip_query_and_fragment(seed), "category", depth=0, discovered_from="seed")
    db.commit()

    processed = 0
    allowed_types = ("product", "category")

    while True:
        if max_pages is not None and processed >= max_pages:
            break

        row = db.next_pending_url(site_cfg.key, allowed_types=allowed_types, max_depth=max_depth)
        if not row:
            break

        url = str(row["url"])
        url_type = str(row["url_type"])
        depth = int(row["depth"])

        try:
            page_html, headers = client.get_text(url)
            blocked = detect_block_page(page_html)
            http_status = 200
            if blocked:
                db.set_url_status(site_cfg.key, url, "blocked", http_status=http_status, blocked=True, error="captcha_or_block")
                db.commit()
                logger.warn(f"{site_cfg.key} blocked: {url}")
                processed += 1
                continue

            found_sku = None
            found_title = None
            found_category = None
            if url_type == "product":
                parsed = parse_product(site_cfg.key, page_html, url)
                found_sku = normalize_space(str(parsed.get("sku", "") or "")).upper() or None
                found_title = normalize_space(str(parsed.get("title", "") or "")) or None
                found_category = normalize_space(str(parsed.get("category_path", "") or "")) or None
                db.upsert_product(
                    site_cfg.key,
                    url,
                    found_sku,
                    found_title,
                    found_category,
                    payload={"headers": headers, "url_type": url_type},
                )

            if discover_links and depth < max_depth:
                links = extract_links(page_html, url)
                for link in links:
                    if not link.startswith(site_cfg.base_url):
                        continue
                    link_type = classify_url(site_cfg, link)
                    if link_type in {"product", "category"}:
                        db.enqueue_url(site_cfg.key, link, link_type, depth=depth + 1, discovered_from=url)

            db.set_url_status(site_cfg.key, url, "done", http_status=http_status, blocked=False, error=None)
            db.commit()
            processed += 1

            if found_sku:
                logger.info(f"{site_cfg.key} product ok: sku={found_sku} url={url}")
            else:
                logger.info(f"{site_cfg.key} page ok: type={url_type} depth={depth} url={url}")
        except HTTPError as exc:
            code = int(exc.code)
            if code in {404, 410}:
                db.set_url_status(site_cfg.key, url, "gone", http_status=code, blocked=False, error=f"HTTP {code}")
                db.commit()
                processed += 1
                logger.info(f"{site_cfg.key} gone ({code}): {url}")
            else:
                db.set_url_status(site_cfg.key, url, "error", http_status=code, blocked=False, error=safe_exc(exc))
                db.commit()
                processed += 1
                logger.warn(f"{site_cfg.key} HTTP error {code}: {url}")
        except Exception as exc:
            db.set_url_status(site_cfg.key, url, "error", http_status=None, blocked=False, error=safe_exc(exc))
            db.commit()
            processed += 1
            logger.warn(f"{site_cfg.key} page error: {url} :: {safe_exc(exc)}")

        if delay_max > 0:
            time.sleep(random.uniform(delay_min, delay_max))

    return processed


def run_crawl(args: argparse.Namespace) -> int:
    db = IndexDb(Path(args.db_path))
    logger = LogWriter(Path(args.log_path), verbose=args.verbose)
    client = SimpleHttpClient(
        timeout=args.timeout,
        retries=args.retries,
        user_agent=args.user_agent,
        cookie_header=args.cookie_header,
        cookie_file=Path(args.cookie_file) if args.cookie_file else None,
    )

    selected_sites = ["twinset.ru", "twinset.com"] if args.site == "both" else [args.site]

    try:
        for site_key in selected_sites:
            cfg = SITE_CONFIGS[site_key]
            logger.info(f"=== START {site_key} ===")

            if args.retry_errors:
                reset = db.reset_errors(site_key)
                db.commit()
                logger.info(f"{site_key} reset error/blocked -> pending: {reset}")

            sitemaps_done = crawl_sitemaps(
                db=db,
                client=client,
                site_cfg=cfg,
                logger=logger,
                delay_min=args.delay_min,
                delay_max=args.delay_max,
                max_sitemaps=args.max_sitemaps,
            )
            logger.info(f"{site_key} sitemaps processed: {sitemaps_done}")

            pages_done = crawl_urls(
                db=db,
                client=client,
                site_cfg=cfg,
                logger=logger,
                delay_min=args.delay_min,
                delay_max=args.delay_max,
                max_pages=args.max_pages,
                max_depth=args.max_depth,
                discover_links=not args.no_discover_links,
            )
            logger.info(f"{site_key} pages processed: {pages_done}")

            stats = db.stats(site_key)
            logger.info(f"{site_key} stats: {json.dumps(stats, ensure_ascii=False)}")

        exports = db.export_csv(Path(args.export_dir))
        summary = {
            "generated_at": now_iso(),
            "site": args.site,
            "db_path": str(Path(args.db_path).resolve()),
            "log_path": str(Path(args.log_path).resolve()),
            "exports": exports,
            "stats": {
                key: db.stats(key)
                for key in (["twinset.ru", "twinset.com"] if args.site == "both" else [args.site])
            },
        }
        summary_path = Path(args.export_dir) / "crawl_summary.json"
        summary_path.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
        logger.info(f"exported: {json.dumps(exports, ensure_ascii=False)}")
        logger.info(f"summary: {summary_path}")
        print(json.dumps(summary, ensure_ascii=False, indent=2))
        return 0
    finally:
        db.close()


def run_match(args: argparse.Namespace) -> int:
    db = IndexDb(Path(args.db_path))
    logger = LogWriter(Path(args.log_path), verbose=args.verbose)
    try:
        if args.articles_csv:
            articles = load_articles_from_csv(Path(args.articles_csv), column=args.article_column)
        elif args.xlsx:
            articles = load_articles_from_xlsx(Path(args.xlsx), sheet=args.sheet, part_column=args.part_column)
        elif args.articles:
            articles = dedupe_keep_order([normalize_space(a).upper() for a in args.articles.split(",") if normalize_space(a)])
        else:
            raise RuntimeError("Provide one source: --articles-csv or --xlsx or --articles")

        logger.info(f"match articles count: {len(articles)}")
        outputs = db.match_articles(articles, export_dir=Path(args.export_dir))
        logger.info(f"match outputs: {json.dumps(outputs, ensure_ascii=False)}")
        print(json.dumps(outputs, ensure_ascii=False, indent=2))
        return 0
    finally:
        db.close()


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Twinset full-site SKU indexer")
    sub = parser.add_subparsers(dest="command", required=True)

    crawl = sub.add_parser("crawl", help="Crawl sitemap/categories and build SKU index DB")
    crawl.add_argument("--site", choices=["twinset.ru", "twinset.com", "both"], default="both")
    crawl.add_argument("--db-path", default="outputs/site_index/twinset_index.db")
    crawl.add_argument("--log-path", default="outputs/site_index/twinset_index.log")
    crawl.add_argument("--export-dir", default="outputs/site_index/exports")
    crawl.add_argument("--max-sitemaps", type=int, help="Limit processed sitemaps (for smoke test)")
    crawl.add_argument("--max-pages", type=int, help="Limit processed pages (for smoke test)")
    crawl.add_argument("--max-depth", type=int, default=2, help="Category discovery depth")
    crawl.add_argument("--no-discover-links", action="store_true", help="Disable link discovery from pages")
    crawl.add_argument("--retry-errors", action="store_true", help="Requeue error/blocked URLs")
    crawl.add_argument("--timeout", type=float, default=35.0)
    crawl.add_argument("--retries", type=int, default=3)
    crawl.add_argument("--delay-min", type=float, default=0.7)
    crawl.add_argument("--delay-max", type=float, default=1.8)
    crawl.add_argument("--user-agent", default=DEFAULT_UA)
    crawl.add_argument("--cookie-header", help="Raw Cookie header")
    crawl.add_argument("--cookie-file", help="Netscape cookies.txt path")
    crawl.add_argument("--verbose", action="store_true")

    match = sub.add_parser("match", help="Match article list against existing DB index")
    match.add_argument("--db-path", default="outputs/site_index/twinset_index.db")
    match.add_argument("--log-path", default="outputs/site_index/twinset_index.log")
    match.add_argument("--export-dir", default="outputs/site_index/match")
    match.add_argument("--articles-csv")
    match.add_argument("--article-column", default="article")
    match.add_argument("--xlsx")
    match.add_argument("--sheet")
    match.add_argument("--part-column", default="Parte")
    match.add_argument("--articles", help="Comma-separated articles")
    match.add_argument("--verbose", action="store_true")

    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    if hasattr(args, "delay_max") and args.delay_max < args.delay_min:
        parser.error("--delay-max must be >= --delay-min")

    random.seed(42)
    try:
        if args.command == "crawl":
            return run_crawl(args)
        if args.command == "match":
            return run_match(args)
        parser.error(f"Unknown command: {args.command}")
    except KeyboardInterrupt:
        print("Interrupted", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"Fatal: {safe_exc(exc)}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())

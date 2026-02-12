#!/usr/bin/env python3
"""
Enrich outputs/maxmara/article_cards_full.json with product pages from v2.bosco.ru.

Goal: fill previously-unmatched Max Mara styles by querying Bosco catalog search with
"<commercial_style_prefix11>@<color_code>".

Writes:
- outputs/maxmara/article_cards_full.bosco.json (enriched)
- outputs/maxmara/bosco_match_summary.json

No external deps (stdlib only).
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import subprocess
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple
from urllib.parse import quote


UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def strip_tags(value: str) -> str:
    # Minimal tag stripper good enough for Bosco HTML snippets.
    v = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    v = re.sub(r"<style[\s\S]*?</style>", " ", v, flags=re.IGNORECASE)
    v = re.sub(r"<[^>]+>", " ", v)
    return normalize_space(v)


def parse_rub_price(text: str) -> Optional[float]:
    s = normalize_space(text)
    if not s:
        return None
    s = s.replace("\xa0", " ").replace("₽", "").replace("руб.", "").strip()
    s = s.replace(" ", "")
    try:
        return float(s)
    except Exception:
        return None


def curl_get(url: str, timeout_s: int = 40, retries: int = 3, delay_s: float = 0.6) -> str:
    last_err: Optional[str] = None
    for attempt in range(1, retries + 1):
        try:
            proc = subprocess.run(
                ["curl", "-sS", "-L", "--max-time", str(timeout_s), "-A", UA, url],
                check=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
            )
            return proc.stdout.decode("utf-8", errors="replace")
        except subprocess.CalledProcessError as exc:
            last_err = (exc.stderr or b"").decode("utf-8", errors="replace")[:500]
            if attempt < retries:
                time.sleep(delay_s * attempt)
                continue
            raise RuntimeError(f"curl failed: {url} :: {last_err}")
    raise RuntimeError(f"curl failed: {url} :: {last_err}")


@dataclass(frozen=True)
class QueryTarget:
    style: str
    commercial_style: str
    base11: str
    color_code: Optional[str]
    query: str


def build_queries_for_row(row: Dict[str, Any]) -> List[QueryTarget]:
    style = normalize_space(row.get("style", ""))
    commercial_style = normalize_space(row.get("commercial_style", "")) or style
    base11 = commercial_style[:11] if len(commercial_style) >= 11 else commercial_style

    # Prefer explicit color-code queries, then fallback to base11.
    codes: List[str] = []
    for c in row.get("var_comm_codes") or []:
        c = normalize_space(c)
        if not c:
            continue
        # Some rows store "013; 015; 016" as a single string.
        parts = [p.strip() for p in re.split(r"[;,]", c) if p.strip()]
        codes.extend(parts)
    # De-dup preserving order.
    seen = set()
    codes = [c for c in codes if not (c in seen or seen.add(c))]

    out: List[QueryTarget] = []
    for code in codes:
        out.append(
            QueryTarget(
                style=style,
                commercial_style=commercial_style,
                base11=base11,
                color_code=code,
                query=f"{base11}@{code}",
            )
        )
    out.append(
        QueryTarget(
            style=style,
            commercial_style=commercial_style,
            base11=base11,
            color_code=None,
            query=base11,
        )
    )
    return out


PRODUCT_SLUG_RE = re.compile(r'data-product-slug="(?P<slug>[^"]+)"')


def parse_slugs_from_catalog_search(html: str) -> List[str]:
    slugs: List[str] = []
    seen = set()
    for m in PRODUCT_SLUG_RE.finditer(html):
        slug = m.group("slug")
        if slug in seen:
            continue
        seen.add(slug)
        slugs.append(slug)
    return slugs


def _extract_one(html: str, pattern: str) -> str:
    m = re.search(pattern, html, flags=re.IGNORECASE | re.DOTALL)
    return strip_tags(m.group(1)) if m else ""


def parse_bosco_product_page(url: str, html: str) -> Dict[str, Any]:
    title = _extract_one(html, r"<title>(.*?)</title>")
    canonical = _extract_one(html, r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"')

    brand = _extract_one(html, r'<div class="product-card__title-brand">\s*(.*?)\s*</div>')
    name = _extract_one(html, r'<div class="product-card__title-name">\s*(.*?)\s*</div>')

    code = _extract_one(html, r'<div class="product-card__code">\s*Код:\s*([0-9]+)\s*</div>')

    price_text = _extract_one(
        html, r'<div class="product-card__price-item[^"]*product-card__price-item_current[^"]*">\s*(.*?)\s*</div>'
    )
    price = parse_rub_price(price_text)

    # Details: capture caption/text pairs (Описание + Состав и уход accordions).
    details: Dict[str, str] = {}
    for m in re.finditer(
        r'<span class="details-a__item-caption">\s*(.*?)\s*</span>\s*<span class="details-a__item-text">\s*(.*?)\s*</span>',
        html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        cap = strip_tags(m.group(1)).rstrip(":").strip()
        txt = strip_tags(m.group(2))
        if cap and txt:
            details[cap] = txt

    article = details.get("Артикул") or details.get("Артикул") or ""
    made_in = details.get("Страна производства") or ""
    color = details.get("Цвет") or ""
    composition = details.get("Состав") or ""
    care = details.get("Уход") or ""

    meta_description = _extract_one(html, r'<meta[^>]+name="description"[^>]+content="([^"]+)"')

    # Sizes list from radio labels.
    sizes: List[str] = []
    seen = set()
    for m in re.finditer(r'<span class="select-b__item-text">\s*([^<]+?)\s*</span>', html, flags=re.IGNORECASE):
        s = normalize_space(m.group(1))
        if not s:
            continue
        k = s.upper()
        if k in seen:
            continue
        seen.add(k)
        sizes.append(s)

    # Images
    img_urls: List[str] = []
    seen_img = set()
    for m in re.finditer(r'<img[^>]+src="(https://staticv2\.bosco\.ru/media/[^"]+\.(?:jpg|jpeg|png|webp|JPG|JPEG|PNG|WEBP))"', html):
        u = m.group(1)
        if u in seen_img:
            continue
        seen_img.add(u)
        img_urls.append(u)

    images: List[Dict[str, str]] = []
    for u in img_urls:
        filename = u.rsplit("/", 1)[-1]
        images.append({"url": u, "url_no_query": u, "kind": "detail", "filename": filename})

    out: Dict[str, Any] = {
        "source": "bosco",
        "url": url,
        "canonical": canonical or url,
        "title": title,
        "product_name_line": normalize_space(f"{brand} {name}".strip()),
        "sku": article or code,
        "prices": [price] if (price is not None) else [],
        "currency": "RUB",
        "meta_description": meta_description,
        "short_description": "",
        "detail_description": meta_description,
        "detail_lines": [],
        "collection_line": "",
        "composition_line": composition,
        "care_line": care,
        "model_params_line": "",
        "breadcrumbs": [],
        "images": images,
        "image_count": len(images),
        "sizes": sizes,
        "colors": [color] if color else [],
        "color_codes": [],
        "bosco": {
            "code": code,
            "article": article,
            "brand": brand,
            "name": name,
            "made_in": made_in,
            "details": details,
        },
    }
    return out


def should_accept_for_target(page: Dict[str, Any], target: QueryTarget) -> bool:
    article = normalize_space(((page.get("bosco") or {}).get("article") or ""))
    if not article:
        return False
    # Strong match when we have color-code.
    if target.color_code:
        return article.upper() == f"{target.base11}@{target.color_code}".upper()
    return article.upper().startswith(target.base11.upper())


def ensure_site_data(row: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(row.get("site_data"), dict):
        row["site_data"] = {"site": "multi", "candidate_urls": [], "best_match": None, "pages": []}
    sd = row["site_data"]
    sd.setdefault("site", "multi")
    sd.setdefault("candidate_urls", [])
    sd.setdefault("candidate_urls_exact_color", [])
    sd.setdefault("candidate_urls_model_only", [])
    sd.setdefault("best_match", None)
    sd.setdefault("pages", [])
    return sd


def main(argv: Optional[Sequence[str]] = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--cards-json", default="outputs/maxmara/article_cards_full.json")
    ap.add_argument("--out-json", default="outputs/maxmara/article_cards_full.bosco.json")
    ap.add_argument("--summary-json", default="outputs/maxmara/bosco_match_summary.json")
    ap.add_argument(
        "--only-unmatched-csv",
        default="",
        help="If set, only process styles listed in this CSV (expects column 'style').",
    )
    ap.add_argument("--timeout", type=int, default=40)
    ap.add_argument("--retries", type=int, default=3)
    ap.add_argument("--delay", type=float, default=0.6)
    ap.add_argument("--max-slugs", type=int, default=12, help="limit product candidates per query")
    args = ap.parse_args(list(argv) if argv is not None else None)

    cards_path = Path(args.cards_json)
    out_path = Path(args.out_json)
    summary_path = Path(args.summary_json)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    summary_path.parent.mkdir(parents=True, exist_ok=True)

    rows: List[Dict[str, Any]] = json.loads(cards_path.read_text("utf-8"))

    only_styles: Optional[set[str]] = None
    if args.only_unmatched_csv:
        only_styles = set()
        csv_path = Path(args.only_unmatched_csv)
        with csv_path.open("r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for r in reader:
                s = normalize_space((r or {}).get("style", ""))
                if s:
                    only_styles.add(s)

    matched_styles = 0
    total_pages_added = 0
    per_style: List[Dict[str, Any]] = []

    for row in rows:
        style = normalize_space(row.get("style", ""))
        if only_styles is not None and style not in only_styles:
            continue
        sd = ensure_site_data(row)
        before_pages = len(sd.get("pages") or [])

        # If already matched somewhere, still try Bosco as an additional source (but don't spam).
        targets = build_queries_for_row(row)

        added_for_style: List[Dict[str, Any]] = []
        tried_queries: List[str] = []
        errors: List[str] = []

        for target in targets:
            tried_queries.append(target.query)
            q = quote(target.query, safe="")
            search_url = f"https://v2.bosco.ru/catalog/?q={q}"
            try:
                search_html = curl_get(search_url, timeout_s=args.timeout, retries=args.retries, delay_s=args.delay)
            except Exception as exc:
                errors.append(f"search_failed:{target.query}:{exc}")
                continue

            slugs = parse_slugs_from_catalog_search(search_html)[: max(1, int(args.max_slugs))]
            if not slugs:
                continue

            for slug in slugs:
                product_url = f"https://v2.bosco.ru/product/{slug.strip('/')}/"
                try:
                    product_html = curl_get(product_url, timeout_s=args.timeout, retries=args.retries, delay_s=args.delay)
                    page = parse_bosco_product_page(product_url, product_html)
                except Exception as exc:
                    errors.append(f"product_failed:{product_url}:{exc}")
                    continue

                if not should_accept_for_target(page, target):
                    continue

                # Avoid duplicates by URL.
                existing_urls = {p.get("url") for p in (sd.get("pages") or []) if isinstance(p, dict)}
                if page.get("url") in existing_urls:
                    continue

                sd["pages"] = list(sd.get("pages") or []) + [page]
                if not sd.get("best_match"):
                    sd["best_match"] = page
                added_for_style.append({"query": target.query, "url": product_url, "article": (page.get("bosco") or {}).get("article")})

            # If we matched the exact article for this query, no need to try more.
            if added_for_style and target.color_code:
                break

        after_pages = len(sd.get("pages") or [])
        added_pages = after_pages - before_pages
        if added_pages > 0:
            matched_styles += 1
            total_pages_added += added_pages

        per_style.append(
            {
                "style": style,
                "before_pages": before_pages,
                "after_pages": after_pages,
                "added_pages": added_pages,
                "added": added_for_style[:50],
                "queries": tried_queries[:50],
                "errors": errors[:50],
            }
        )

    out_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", "utf-8")
    summary_path.write_text(
        json.dumps(
            {
                "cards_in": str(cards_path),
                "cards_out": str(out_path),
                "styles_total": len(rows),
                "styles_with_pages_added": matched_styles,
                "pages_added": total_pages_added,
                "per_style": per_style,
            },
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        "utf-8",
    )

    print(
        json.dumps(
            {
                "styles_total": len(rows),
                "styles_with_pages_added": matched_styles,
                "pages_added": total_pages_added,
                "out": str(out_path),
                "summary": str(summary_path),
            },
            ensure_ascii=False,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

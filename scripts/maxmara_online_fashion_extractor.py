#!/usr/bin/env python3
"""
Build a максимально-полный карточный датасет для артикулов из xls
с обогащением данными из online-fashion.ru (Max Mara URLs).

Outputs:
- outputs/maxmara/article_cards_full.json
- outputs/maxmara/article_cards_full.csv
- outputs/maxmara/article_cards_unmatched.csv
- outputs/maxmara/online_fashion_url_index.json
- outputs/maxmara/run_summary.json
- outputs/maxmara/images/... (optional downloads)

No non-stdlib deps besides xlrd for .xls parsing.
"""

from __future__ import annotations

import argparse
import csv
import html
import json
import os
import re
import subprocess
import time
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Set, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urljoin, urlparse
from urllib.request import Request, build_opener


try:
    import xlrd  # type: ignore
except Exception as exc:  # pragma: no cover
    raise SystemExit(
        "xlrd is required for .xls parsing. Install in venv: pip install xlrd==2.0.1"
    ) from exc


UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/131.0.0.0 Safari/537.36"
)

MODEL_PREFIXES = (
    "wkd",
    "wkd",
    "mst",
    "mxm",
    "smm",
    "smd",
    "mmd",
    "wmm",
)

BRAND_SEGMENTS = {
    "max",
    "mara",
    "weekend",
    "s",
    "maxmara",
    "studio",
    "collection",
    "mm",
}

IMAGE_EXT_RE = re.compile(r"\.(?:jpg|jpeg|png|webp)(?:\?|$)", re.IGNORECASE)


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def strip_tags(value: str) -> str:
    value = re.sub(r"<script[\s\S]*?</script>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<style[\s\S]*?</style>", " ", value, flags=re.IGNORECASE)
    value = re.sub(r"<[^>]+>", " ", value)
    return normalize_space(html.unescape(value))


def safe_filename(value: str) -> str:
    out = re.sub(r"[^a-zA-Z0-9._-]+", "-", value.strip().lower())
    out = re.sub(r"-+", "-", out).strip("-")
    return out or "item"


def parse_number(value: str) -> Optional[float]:
    raw = normalize_space(value)
    if not raw:
        return None
    raw = raw.replace(" ", "").replace(",", ".")
    try:
        return float(raw)
    except Exception:
        return None


class HttpClient:
    def __init__(self, timeout: float, retries: int, delay: float, use_curl_fallback: bool) -> None:
        self.timeout = timeout
        self.retries = retries
        self.delay = delay
        self.use_curl_fallback = use_curl_fallback
        self.opener = build_opener()

    def _curl_fetch(self, url: str) -> bytes:
        # curl is often more robust across networks (IPv4/IPv6 issues, weird TLS middleboxes).
        cmd = [
            "curl",
            "-L",
            "--max-time",
            str(int(max(5, self.timeout))),
            "-A",
            UA,
            "-sS",
            url,
        ]
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=False)
        if proc.returncode != 0:
            err = normalize_space(proc.stderr.decode("utf-8", "ignore"))
            raise RuntimeError(f"curl failed rc={proc.returncode}: {err[:300]}")
        return proc.stdout

    def get_bytes(self, url: str) -> bytes:
        last_exc: Optional[Exception] = None
        for attempt in range(self.retries + 1):
            try:
                req = Request(
                    url,
                    headers={
                        "User-Agent": UA,
                        "Accept": "text/html,application/xml;q=0.9,*/*;q=0.8",
                    },
                )
                with self.opener.open(req, timeout=self.timeout) as resp:
                    data = resp.read()
                if self.delay > 0:
                    time.sleep(self.delay)
                return data
            except (HTTPError, URLError, TimeoutError, OSError) as exc:
                last_exc = exc
                if attempt < self.retries:
                    time.sleep(min(2.5, 0.5 + attempt * 0.4))
                    continue
                # last attempt: optional curl fallback
                if self.use_curl_fallback:
                    return self._curl_fetch(url)
                raise
        if last_exc:
            raise last_exc
        raise RuntimeError("unexpected fetch state")

    def get_text(self, url: str) -> str:
        data = self.get_bytes(url)
        return data.decode("utf-8", "ignore")


@dataclass
class ArticleSeed:
    style: str
    commercial_style: str
    name: str
    invoice_numbers: List[str]
    invoice_dates: List[str]
    ddt_numbers: List[str]
    ddt_dates: List[str]
    season_years: List[str]
    currency: List[str]
    made_in: List[str]
    brand: List[str]
    item_descriptions: List[str]
    composition_fabric: List[str]
    composition_description: List[str]
    composition_details: List[str]
    customs_codes: List[str]
    sizes: List[str]
    var_comm_codes: List[str]
    var_descriptions: List[str]
    eans: List[str]
    total_qty: int
    total_net_amount: float
    unit_cost_prices: List[float]
    unit_weights: List[float]


def parse_xls_articles(path: Path) -> List[ArticleSeed]:
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    headers = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
    idx = {h: i for i, h in enumerate(headers)}

    required = [
        "Style",
        "Commercial Style",
        "Name",
        "Invoice Number",
        "Invoice Date",
        "Ddt Number",
        "Ddt Date",
        "Qta",
        "Total Net Amount",
        "Unit Cost Price",
        "Ean Code",
        "Season year",
        "Sizing",
        "Var Comm",
        "Var Description OE",
        "Composition Fabric",
        "Composition Description",
        "Composition Details",
        "Item Description",
        "Made In",
        "Customs Code",
        "Currency",
        "Weigth",
        "Brand",
    ]
    for col in required:
        if col not in idx:
            raise ValueError(f"Missing expected column in XLS: {col}")

    by_style: Dict[str, Dict[str, Any]] = {}

    def add_set(bucket: Dict[str, Set[str]], key: str, value: str) -> None:
        val = normalize_space(value)
        if not val:
            return
        bucket.setdefault(key, set()).add(val)

    for r in range(1, sh.nrows):
        style = normalize_space(sh.cell_value(r, idx["Style"]))
        if not style:
            continue

        bucket = by_style.setdefault(
            style,
            {
                "style": style,
                "commercial_style": normalize_space(sh.cell_value(r, idx["Commercial Style"])),
                "name": normalize_space(sh.cell_value(r, idx["Name"])),
                "sets": {},
                "qty": 0,
                "net": 0.0,
                "unit_cost_prices": set(),
                "unit_weights": set(),
            },
        )

        sets: Dict[str, Set[str]] = bucket["sets"]
        add_set(sets, "invoice_numbers", str(sh.cell_value(r, idx["Invoice Number"])) )
        add_set(sets, "invoice_dates", str(sh.cell_value(r, idx["Invoice Date"])) )
        add_set(sets, "ddt_numbers", str(sh.cell_value(r, idx["Ddt Number"])) )
        add_set(sets, "ddt_dates", str(sh.cell_value(r, idx["Ddt Date"])) )
        add_set(sets, "season_years", str(sh.cell_value(r, idx["Season year"])) )
        add_set(sets, "currency", str(sh.cell_value(r, idx["Currency"])) )
        add_set(sets, "made_in", str(sh.cell_value(r, idx["Made In"])) )
        add_set(sets, "brand", str(sh.cell_value(r, idx["Brand"])) )
        add_set(sets, "item_descriptions", str(sh.cell_value(r, idx["Item Description"])) )
        add_set(sets, "composition_fabric", str(sh.cell_value(r, idx["Composition Fabric"])) )
        add_set(sets, "composition_description", str(sh.cell_value(r, idx["Composition Description"])) )
        add_set(sets, "composition_details", str(sh.cell_value(r, idx["Composition Details"])) )
        add_set(sets, "customs_codes", str(sh.cell_value(r, idx["Customs Code"])) )
        add_set(sets, "sizes", str(sh.cell_value(r, idx["Sizing"])) )
        add_set(sets, "var_comm_codes", str(sh.cell_value(r, idx["Var Comm"])) )
        add_set(sets, "var_descriptions", str(sh.cell_value(r, idx["Var Description OE"])) )
        add_set(sets, "eans", str(sh.cell_value(r, idx["Ean Code"])) )

        q = parse_number(str(sh.cell_value(r, idx["Qta"]))) or 0.0
        net = parse_number(str(sh.cell_value(r, idx["Total Net Amount"]))) or 0.0
        price = parse_number(str(sh.cell_value(r, idx["Unit Cost Price"])))
        weight = parse_number(str(sh.cell_value(r, idx["Weigth"])))

        bucket["qty"] += int(round(q))
        bucket["net"] += float(net)
        if price is not None:
            bucket["unit_cost_prices"].add(round(float(price), 4))
        if weight is not None:
            bucket["unit_weights"].add(round(float(weight), 4))

    out: List[ArticleSeed] = []
    for _, item in sorted(by_style.items()):
        sets = item["sets"]
        out.append(
            ArticleSeed(
                style=item["style"],
                commercial_style=item["commercial_style"],
                name=item["name"],
                invoice_numbers=sorted(sets.get("invoice_numbers", set())),
                invoice_dates=sorted(sets.get("invoice_dates", set())),
                ddt_numbers=sorted(sets.get("ddt_numbers", set())),
                ddt_dates=sorted(sets.get("ddt_dates", set())),
                season_years=sorted(sets.get("season_years", set())),
                currency=sorted(sets.get("currency", set())),
                made_in=sorted(sets.get("made_in", set())),
                brand=sorted(sets.get("brand", set())),
                item_descriptions=sorted(sets.get("item_descriptions", set())),
                composition_fabric=sorted(sets.get("composition_fabric", set())),
                composition_description=sorted(sets.get("composition_description", set())),
                composition_details=sorted(sets.get("composition_details", set())),
                customs_codes=sorted(sets.get("customs_codes", set())),
                sizes=sorted(sets.get("sizes", set())),
                var_comm_codes=sorted(sets.get("var_comm_codes", set())),
                var_descriptions=sorted(sets.get("var_descriptions", set())),
                eans=sorted(sets.get("eans", set())),
                total_qty=item["qty"],
                total_net_amount=round(item["net"], 2),
                unit_cost_prices=sorted(item["unit_cost_prices"]),
                unit_weights=sorted(item["unit_weights"]),
            )
        )
    return out


def parse_sitemap_urls(client: HttpClient) -> List[str]:
    index_url = "https://www.online-fashion.ru/sitemap/online-fashion.ru/product.xml"
    xml = client.get_text(index_url)
    part_urls = re.findall(
        r"<loc>(https://www\.online-fashion\.ru/sitemap/online-fashion\.ru/product\.part\d+\.xml)</loc>",
        xml,
    )
    all_urls: List[str] = []
    for p in part_urls:
        px = client.get_text(p)
        urls = re.findall(r"<loc>(https://www\.online-fashion\.ru/product/[^<]+)</loc>", px)
        all_urls.extend(urls)
    # keep only Max Mara lines
    mm = [
        u
        for u in all_urls
        if "max-mara" in u.lower() or "s-max-mara" in u.lower() or "max-mara-weekend" in u.lower()
    ]
    # de-dup
    seen = set()
    out: List[str] = []
    for u in mm:
        if u in seen:
            continue
        seen.add(u)
        out.append(u)
    return out


def slug_segments(url: str) -> List[str]:
    path = urlparse(url).path
    seg = [s for s in path.strip("/").split("/") if s]
    if not seg:
        return []
    slug = seg[-1].lower()
    return [x for x in slug.split("-") if x]


def strip_brand_prefix(segments: List[str]) -> List[str]:
    """
    Remove leading brand prefix tokens from a product slug like:
      max-mara-<model>-<color>-<id>
      max-mara-weekend-<model>-...
      s-max-mara-<model>-...
    Keep later occurrences: model 'mara' should still be matchable if it appears
    again after the brand prefix.
    """
    segs = [s for s in segments if s and not s.isdigit()]
    # Normalize common prefixes
    if segs[:3] == ["max", "mara", "weekend"]:
        return segs[3:]
    if segs[:3] == ["s", "max", "mara"]:
        return segs[3:]
    if segs[:2] == ["max", "mara"]:
        return segs[2:]
    return segs


def model_token_match(name: str, segments: List[str]) -> bool:
    token = name.lower().strip()
    if not token:
        return False

    core = strip_brand_prefix([s.lower() for s in segments])

    # exact token
    if token in core:
        return True

    # prefixed forms: wkdmulino, mstetere, mxm...
    for s in core:
        if s.endswith(token):
            prefix = s[: len(s) - len(token)]
            if prefix in MODEL_PREFIXES:
                return True

    # safe fallback for tokens length >= 5
    if len(token) >= 5:
        for s in core:
            if token in s:
                return True

    return False


def var_code_match(var_codes: List[str], segments: List[str]) -> bool:
    if not var_codes:
        return False
    valid = {v.zfill(3) for v in var_codes if v.isdigit()}
    if not valid:
        return False
    return any(seg in valid for seg in segments)


def pick_candidates(article: ArticleSeed, url_index: List[str]) -> Tuple[List[str], List[str]]:
    name = article.name.lower().strip()
    model_hits: List[str] = []

    for u in url_index:
        segs = slug_segments(u)
        if model_token_match(name, segs):
            model_hits.append(u)

    if not model_hits:
        return [], []

    exact_color = [u for u in model_hits if var_code_match(article.var_comm_codes, slug_segments(u))]
    return exact_color, model_hits


def extract_meta(html_text: str, key: str, attr: str = "name") -> Optional[str]:
    m = re.search(
        rf"<meta[^>]*{attr}\s*=\s*\"{re.escape(key)}\"[^>]*content\s*=\s*\"([^\"]*)\"",
        html_text,
        re.IGNORECASE,
    )
    if not m:
        return None
    return normalize_space(html.unescape(m.group(1)))


def extract_title(html_text: str) -> Optional[str]:
    m = re.search(r"<title[^>]*>([\s\S]*?)</title>", html_text, re.IGNORECASE)
    if not m:
        return None
    return normalize_space(html.unescape(m.group(1)))


def extract_canonical(html_text: str) -> Optional[str]:
    m = re.search(r'<link[^>]+rel="canonical"[^>]+href="([^"]+)"', html_text, re.IGNORECASE)
    if not m:
        return None
    return normalize_space(m.group(1))


def extract_breadcrumbs(html_text: str) -> List[str]:
    block = re.search(r'<div[^>]+class="breadcrumbs"[^>]*>([\s\S]*?)</div>', html_text, re.IGNORECASE)
    if not block:
        return []
    vals = re.findall(r"itemprop='name'>([^<]+)<", block.group(1), re.IGNORECASE)
    out = [normalize_space(html.unescape(v)) for v in vals if normalize_space(v)]
    return out


def extract_text_block(html_text: str, class_name: str) -> Optional[str]:
    m = re.search(
        rf'<div[^>]+class="{re.escape(class_name)}"[^>]*>([\s\S]*?)</div>',
        html_text,
        re.IGNORECASE,
    )
    if not m:
        return None
    return strip_tags(m.group(1))


def extract_item_description_html(html_text: str) -> Optional[str]:
    m = re.search(
        r'<div[^>]+class="item-description"[^>]*>([\s\S]*?)</div>',
        html_text,
        re.IGNORECASE,
    )
    if not m:
        return None
    return normalize_space(m.group(1))


def extract_detail_lines(html_text: str) -> List[str]:
    m = extract_item_description_html(html_text)
    if not m:
        return []
    lines = re.findall(r"<p[^>]*>([\s\S]*?)</p>", m, re.IGNORECASE)
    out = []
    for line in lines:
        txt = strip_tags(line)
        if txt:
            out.append(txt)
    if out:
        return out
    raw = strip_tags(m)
    return [raw] if raw else []


def extract_prices(html_text: str) -> Tuple[List[float], Optional[str]]:
    price_strs = re.findall(r'<meta[^>]+itemprop="price"[^>]+content="([0-9]+(?:\.[0-9]+)?)"', html_text, re.IGNORECASE)
    currency = None
    m_curr = re.search(r'<meta[^>]+itemprop="priceCurrency"[^>]+content="([A-Z]{3})"', html_text, re.IGNORECASE)
    if m_curr:
        currency = m_curr.group(1)
    prices = sorted({float(p) for p in price_strs})
    return prices, currency


def extract_sku(html_text: str) -> Optional[str]:
    m = re.search(r'<meta[^>]+itemprop="sku"[^>]+content="([^"]+)"', html_text, re.IGNORECASE)
    if m:
        return normalize_space(m.group(1))
    m2 = re.search(r'<div[^>]+class="productcode"[^>]*>([^<]+)</div>', html_text, re.IGNORECASE)
    if m2:
        return normalize_space(m2.group(1))
    return None


def extract_sizes(html_text: str) -> List[str]:
    vals = []
    vals.extend(re.findall(r"'SIZE_1C':\{[^{}]*?'VALUE':'([^']*)'", html_text, re.IGNORECASE))
    vals.extend(re.findall(r"'SIZES':\{[^{}]*?'VALUE':'([^']*)'", html_text, re.IGNORECASE))
    out = sorted({normalize_space(v) for v in vals if normalize_space(v)})
    return out


def extract_colors(html_text: str) -> Tuple[List[str], List[str]]:
    color_names = re.findall(r"'COLOR_1C':\{[^{}]*?'VALUE':'([^']*)'", html_text, re.IGNORECASE)
    color_codes = re.findall(r"'COLOR_CODE_1C':\{[^{}]*?'VALUE':'([^']*)'", html_text, re.IGNORECASE)
    return (
        sorted({normalize_space(v) for v in color_names if normalize_space(v)}),
        sorted({normalize_space(v) for v in color_codes if normalize_space(v)}),
    )


def extract_collection_and_composition(detail_lines: List[str]) -> Dict[str, Any]:
    data: Dict[str, Any] = {
        "collection": None,
        "composition_text": None,
        "care_text": None,
        "model_params": None,
    }
    for ln in detail_lines:
        l = ln.lower()
        if "новая коллекция" in l and data["collection"] is None:
            data["collection"] = normalize_space(ln)
        if ("состав" in l or "fabric" in l) and data["composition_text"] is None:
            data["composition_text"] = normalize_space(ln)
        if ("уход" in l or "care" in l) and data["care_text"] is None:
            data["care_text"] = normalize_space(ln)
        if ("параметры фотомодели" in l or "рост" in l) and data["model_params"] is None:
            data["model_params"] = normalize_space(ln)
    return data


def classify_image(url: str) -> str:
    lowered = url.lower()
    if "/1200_1600_" in lowered:
        return "detail_1200"
    if "/600_800_" in lowered:
        return "detail_600"
    if "/450_600_" in lowered:
        return "mobile_450"
    if "/390_520_" in lowered:
        return "card_390"
    if "/300_400_" in lowered:
        return "card_300"
    if "/200_300_" in lowered:
        return "thumb_200"
    if "/90_120_" in lowered:
        return "thumb_90"
    if "/upload/thumb/" in lowered:
        return "thumb_upload"
    return "other"


def extract_images(html_text: str, base_url: str) -> List[Dict[str, str]]:
    cands: List[str] = []
    # src / data-src / href
    cands.extend(re.findall(r'(?:src|data-src|href)="([^"]+)"', html_text, re.IGNORECASE))
    # srcset values
    for srcset in re.findall(r'srcset="([^"]+)"', html_text, re.IGNORECASE):
        for part in srcset.split(","):
            u = normalize_space(part.split(" ")[0])
            if u:
                cands.append(u)

    out: List[Dict[str, str]] = []
    seen = set()
    for u in cands:
        if not IMAGE_EXT_RE.search(u):
            continue
        abs_url = urljoin(base_url, u)
        if "/upload/" not in abs_url:
            continue
        no_q = abs_url.split("?", 1)[0]
        key = no_q
        if key in seen:
            continue
        seen.add(key)
        out.append(
            {
                "url": abs_url,
                "url_no_query": no_q,
                "kind": classify_image(abs_url),
                "filename": os.path.basename(no_q),
            }
        )

    # stable ordering: by kind then filename
    out.sort(key=lambda x: (x["kind"], x["filename"]))
    return out


def extract_js_object_literal(page_html: str, marker: str) -> Optional[str]:
    """
    Extract a JS object literal that starts right after a marker, using bracket matching.
    Returns substring including surrounding braces { ... }.
    """
    start_marker = page_html.find(marker)
    if start_marker < 0:
        return None

    idx = start_marker + len(marker)
    length = len(page_html)

    # Find first '{'
    while idx < length and page_html[idx] != "{":
        idx += 1
    if idx >= length or page_html[idx] != "{":
        return None

    open_ch = "{"
    close_ch = "}"
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

        if ch in ("'", '"'):
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


def parse_product_page(url: str, html_text: str) -> Dict[str, Any]:
    title = extract_title(html_text)
    canonical = extract_canonical(html_text)
    meta_desc = extract_meta(html_text, "description", attr="name")
    og_title = extract_meta(html_text, "og:title", attr="property")
    og_desc = extract_meta(html_text, "og:description", attr="property")
    og_image = extract_meta(html_text, "og:image", attr="property")

    prices, currency = extract_prices(html_text)
    sku = extract_sku(html_text)
    breadcrumbs = extract_breadcrumbs(html_text)
    detail_lines = extract_detail_lines(html_text)
    detail_text = "\n".join(detail_lines)
    extracted = extract_collection_and_composition(detail_lines)
    sizes = extract_sizes(html_text)
    color_names, color_codes = extract_colors(html_text)
    images = extract_images(html_text, url)

    short_desc = og_desc or meta_desc
    product_name_line = extract_text_block(html_text, "catalog-item-type")

    # Bitrix payload: contains offers/properties/prices; keep raw for later deep parsing.
    jc_payload = extract_js_object_literal(html_text, "new JCCatalogElement(")

    return {
        "source": "online-fashion.ru",
        "url": url,
        "canonical": canonical,
        "title": title,
        "product_name_line": product_name_line,
        "sku": sku,
        "prices": prices,
        "currency": currency,
        "meta_description": meta_desc,
        "og_title": og_title,
        "og_description": og_desc,
        "og_image": og_image,
        "short_description": short_desc,
        "detail_description": detail_text,
        "detail_lines": detail_lines,
        "collection_line": extracted["collection"],
        "composition_line": extracted["composition_text"],
        "care_line": extracted["care_text"],
        "model_params_line": extracted["model_params"],
        "breadcrumbs": breadcrumbs,
        "sizes": sizes,
        "colors": color_names,
        "color_codes": color_codes,
        "images": images,
        "image_count": len(images),
        "jccatalog_payload_raw": jc_payload,
    }


def download_images(
    client: HttpClient,
    style: str,
    pages: List[Dict[str, Any]],
    out_dir: Path,
    overwrite: bool,
) -> Dict[str, Any]:
    target_root = out_dir / "images" / "online-fashion" / safe_filename(style)
    target_root.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed = 0

    for page in pages:
        page_slug = safe_filename(urlparse(page["url"]).path.strip("/").replace("/", "-"))
        page_dir = target_root / page_slug
        page_dir.mkdir(parents=True, exist_ok=True)

        for img in page.get("images", []):
            filename = f"{img.get('kind','other')}__{img.get('filename','img.webp')}"
            dst = page_dir / filename
            if dst.exists() and dst.stat().st_size > 0 and not overwrite:
                skipped += 1
                continue
            try:
                data = client.get_bytes(img["url"])
                dst.write_bytes(data)
                downloaded += 1
            except Exception:
                failed += 1

    return {
        "downloaded": downloaded,
        "skipped": skipped,
        "failed": failed,
        "dir": str(target_root),
    }

def download_images_from_json(
    client: HttpClient,
    article_cards_json: Path,
    out_dir: Path,
    workers: int,
    overwrite: bool,
) -> Dict[str, Any]:
    data = json.loads(article_cards_json.read_text(encoding="utf-8"))

    jobs: List[Tuple[str, str, str]] = []
    # (dst_path, url, kind)
    for row in data:
        style = str(row.get("style") or "")
        pages = (((row.get("site_data") or {}).get("pages")) or [])
        if not style or not pages:
            continue
        for page in pages:
            page_url = str(page.get("url") or "")
            page_slug = safe_filename(urlparse(page_url).path.strip("/").replace("/", "-"))
            for img in page.get("images", []) or []:
                img_url = str(img.get("url") or "")
                if not img_url:
                    continue
                filename = f"{img.get('kind','other')}__{img.get('filename','img.webp')}"
                dst = out_dir / "images" / "online-fashion" / safe_filename(style) / page_slug / filename
                jobs.append((str(dst), img_url, str(img.get("kind") or "other")))

    # De-dup by dst path
    dedup: Dict[str, Tuple[str, str]] = {}
    for dst, u, kind in jobs:
        dedup.setdefault(dst, (u, kind))
    items = list(dedup.items())

    downloaded = 0
    skipped = 0
    failed = 0

    def one(dst_path: str, url: str) -> Tuple[str, bool, Optional[str]]:
        dst = Path(dst_path)
        dst.parent.mkdir(parents=True, exist_ok=True)
        if dst.exists() and dst.stat().st_size > 0 and not overwrite:
            return dst_path, False, None
        try:
            data = client.get_bytes(url)
            dst.write_bytes(data)
            return dst_path, True, None
        except Exception as exc:
            return dst_path, False, normalize_space(str(exc))

    errors: Dict[str, str] = {}
    with ThreadPoolExecutor(max_workers=max(1, workers)) as ex:
        futures = []
        for dst_path, (url, _kind) in items:
            futures.append(ex.submit(one, dst_path, url))
        for i, fut in enumerate(as_completed(futures), 1):
            dst_path, did, err = fut.result()
            if did:
                downloaded += 1
            else:
                # Either skipped or failed; determine by err
                if err:
                    failed += 1
                    errors[dst_path] = err
                else:
                    skipped += 1
            if i % 200 == 0:
                print(f"  images processed {i}/{len(futures)} (downloaded={downloaded}, failed={failed})...", flush=True)

    # Keep errors file for debugging
    (out_dir / "image_download_errors.json").write_text(
        json.dumps(errors, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    return {
        "image_jobs": len(items),
        "downloaded": downloaded,
        "skipped": skipped,
        "failed": failed,
        "errors_json": str(out_dir / "image_download_errors.json"),
        "root_dir": str(out_dir / "images" / "online-fashion"),
    }


def flatten_for_csv(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in rows:
        site = row.get("site_data", {})
        best = site.get("best_match") or {}
        line = {
            "style": row.get("style", ""),
            "commercial_style": row.get("commercial_style", ""),
            "name": row.get("name", ""),
            "invoice_numbers": "; ".join(row.get("invoice_numbers", [])),
            "ddt_numbers": "; ".join(row.get("ddt_numbers", [])),
            "season_years": "; ".join(row.get("season_years", [])),
            "made_in": "; ".join(row.get("made_in", [])),
            "xls_sizes": "; ".join(row.get("sizes", [])),
            "xls_colors": "; ".join(row.get("var_descriptions", [])),
            "xls_var_codes": "; ".join(row.get("var_comm_codes", [])),
            "eans_count": len(row.get("eans", [])),
            "total_qty": row.get("total_qty", 0),
            "total_net_amount": row.get("total_net_amount", 0),
            "matched": bool(best),
            "best_url": best.get("url", ""),
            "best_title": best.get("title", ""),
            "best_sku": best.get("sku", ""),
            "best_prices": "; ".join(str(p) for p in best.get("prices", [])),
            "best_currency": best.get("currency", ""),
            "best_short_description": best.get("short_description", ""),
            "best_detail_description": best.get("detail_description", ""),
            "best_composition_line": best.get("composition_line", ""),
            "best_care_line": best.get("care_line", ""),
            "best_collection_line": best.get("collection_line", ""),
            "best_sizes": "; ".join(best.get("sizes", [])),
            "best_colors": "; ".join(best.get("colors", [])),
            "best_color_codes": "; ".join(best.get("color_codes", [])),
            "best_image_count": best.get("image_count", 0),
            "candidate_count": len(site.get("candidate_urls", [])),
            "pages_parsed": len(site.get("pages", [])),
            "image_dir": (row.get("download", {}) or {}).get("dir", ""),
        }
        out.append(line)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract full card data for Max Mara articles from online-fashion")
    parser.add_argument(
        "--mode",
        choices=["extract", "download-images", "all"],
        default="extract",
        help="extract: build JSON/CSV with max fields (no downloads). download-images: download all images from JSON. all: both.",
    )
    parser.add_argument(
        "--xls",
        default="/Users/lemelson/ModaMia-Codex-2/NewFilesCardsMaxMaraETC/Fatture_2025AI_CLI - 2025-10-21T152454.177 (2).xls",
    )
    parser.add_argument("--out-dir", default="/Users/lemelson/ModaMia-Codex-2/outputs/maxmara")
    parser.add_argument("--timeout", type=float, default=25.0)
    parser.add_argument("--retries", type=int, default=2)
    parser.add_argument("--delay", type=float, default=0.07)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--overwrite-images", action="store_true")
    parser.add_argument("--curl-fallback", action="store_true", help="Use curl as fallback for network fetches")
    parser.add_argument(
        "--index-policy",
        choices=["cache-first", "refresh", "cache-only"],
        default="cache-first",
        help="How to build URL index from sitemap. cache-first uses existing cache if present.",
    )
    args = parser.parse_args()

    xls_path = Path(args.xls)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    client = HttpClient(timeout=args.timeout, retries=args.retries, delay=args.delay, use_curl_fallback=bool(args.curl_fallback))

    json_path = out_dir / "article_cards_full.json"
    csv_path = out_dir / "article_cards_full.csv"
    unmatched_path = out_dir / "article_cards_unmatched.csv"
    index_cache_path = out_dir / "online_fashion_url_index.json"

    if args.mode in ("download-images", "all") and not json_path.exists():
        raise SystemExit(f"Missing {json_path}. Run with --mode extract first.")

    if args.mode in ("download-images",):
        print("[download-images] Downloading images from JSON...", flush=True)
        # For images we want speed; override delay to 0 to avoid throttling ourselves.
        img_client = HttpClient(
            timeout=args.timeout,
            retries=max(1, args.retries),
            delay=0.0,
            use_curl_fallback=bool(args.curl_fallback),
        )
        res = download_images_from_json(
            client=img_client,
            article_cards_json=json_path,
            out_dir=out_dir,
            workers=max(4, args.workers),
            overwrite=args.overwrite_images,
        )
        (out_dir / "image_download_summary.json").write_text(
            json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(json.dumps(res, ensure_ascii=False, indent=2), flush=True)
        return

    # extract (and optionally download afterwards)
    print("[1/6] Parse XLS...", flush=True)
    articles = parse_xls_articles(xls_path)
    print(f"  unique articles: {len(articles)}", flush=True)

    print("[2/6] Build online-fashion URL index from sitemap...", flush=True)
    url_index: List[str] = []
    used_cache = False
    if args.index_policy in ("cache-first", "cache-only") and index_cache_path.exists():
        try:
            cached = json.loads(index_cache_path.read_text(encoding="utf-8"))
            url_index = list(cached.get("urls") or [])
            used_cache = True
            print(f"  using cached index: {index_cache_path} ({len(url_index)} urls)", flush=True)
        except Exception as exc:
            if args.index_policy == "cache-only":
                raise
            print(f"  cache read failed, will refresh: {exc}", flush=True)

    if not url_index or args.index_policy == "refresh":
        url_index = parse_sitemap_urls(client)
        print(f"  max mara product urls: {len(url_index)}", flush=True)
        index_dump = {
            "generated_at": int(time.time()),
            "site": "online-fashion.ru",
            "url_count": len(url_index),
            "urls": url_index,
        }
        index_cache_path.write_text(json.dumps(index_dump, ensure_ascii=False, indent=2), encoding="utf-8")
    elif used_cache:
        print(f"  max mara product urls: {len(url_index)}", flush=True)

    print("[3/6] Match article -> candidate URLs...", flush=True)
    article_candidates: Dict[str, Dict[str, List[str]]] = {}
    for a in articles:
        exact_color, model_hits = pick_candidates(a, url_index)
        article_candidates[a.style] = {
            "exact_color": exact_color,
            "model_hits": model_hits,
        }

    print("[4/6] Fetch + parse candidate product pages...", flush=True)
    # collect unique candidate URLs to fetch once
    unique_candidate_urls: Set[str] = set()
    for cand in article_candidates.values():
        chosen = cand["exact_color"] if cand["exact_color"] else cand["model_hits"]
        unique_candidate_urls.update(chosen)

    parsed_pages: Dict[str, Dict[str, Any]] = {}
    fetch_errors: Dict[str, str] = {}

    def fetch_parse(u: str) -> Tuple[str, Optional[Dict[str, Any]], Optional[str]]:
        try:
            txt = client.get_text(u)
            page = parse_product_page(u, txt)
            return u, page, None
        except Exception as exc:
            return u, None, normalize_space(str(exc))

    urls_sorted = sorted(unique_candidate_urls)
    if urls_sorted:
        with ThreadPoolExecutor(max_workers=max(1, args.workers)) as ex:
            futures = [ex.submit(fetch_parse, u) for u in urls_sorted]
            for i, fut in enumerate(as_completed(futures), 1):
                u, page, err = fut.result()
                if page is not None:
                    parsed_pages[u] = page
                else:
                    fetch_errors[u] = err or "unknown"
                if i % 25 == 0:
                    print(f"  parsed {i}/{len(urls_sorted)} pages...", flush=True)

    print("[5/6] Build full per-article dataset...", flush=True)
    rows: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []

    for a in articles:
        cand = article_candidates[a.style]
        chosen = cand["exact_color"] if cand["exact_color"] else cand["model_hits"]
        pages = [parsed_pages[u] for u in chosen if u in parsed_pages]

        best_match = pages[0] if pages else None

        row: Dict[str, Any] = {
            "style": a.style,
            "commercial_style": a.commercial_style,
            "name": a.name,
            "invoice_numbers": a.invoice_numbers,
            "invoice_dates": a.invoice_dates,
            "ddt_numbers": a.ddt_numbers,
            "ddt_dates": a.ddt_dates,
            "season_years": a.season_years,
            "currency": a.currency,
            "made_in": a.made_in,
            "brand": a.brand,
            "item_descriptions": a.item_descriptions,
            "composition_fabric": a.composition_fabric,
            "composition_description": a.composition_description,
            "composition_details": a.composition_details,
            "customs_codes": a.customs_codes,
            "sizes": a.sizes,
            "var_comm_codes": a.var_comm_codes,
            "var_descriptions": a.var_descriptions,
            "eans": a.eans,
            "total_qty": a.total_qty,
            "total_net_amount": a.total_net_amount,
            "unit_cost_prices": a.unit_cost_prices,
            "unit_weights": a.unit_weights,
            "site_data": {
                "site": "online-fashion.ru",
                "candidate_urls": chosen,
                "candidate_urls_exact_color": cand["exact_color"],
                "candidate_urls_model_only": cand["model_hits"],
                "best_match": best_match,
                "pages": pages,
            },
        }

        row["download"] = {
            "downloaded": 0,
            "skipped": 0,
            "failed": 0,
            "dir": "",
        }

        rows.append(row)
        if not pages:
            unmatched.append(
                {
                    "style": a.style,
                    "commercial_style": a.commercial_style,
                    "name": a.name,
                    "var_comm_codes": "; ".join(a.var_comm_codes),
                    "var_descriptions": "; ".join(a.var_descriptions),
                }
            )

    print("[6/6] Write outputs...", flush=True)
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    flat_rows = flatten_for_csv(rows)
    if flat_rows:
        with csv_path.open("w", encoding="utf-8", newline="") as fp:
            writer = csv.DictWriter(fp, fieldnames=list(flat_rows[0].keys()))
            writer.writeheader()
            writer.writerows(flat_rows)

    with unmatched_path.open("w", encoding="utf-8", newline="") as fp:
        fields = ["style", "commercial_style", "name", "var_comm_codes", "var_descriptions"]
        writer = csv.DictWriter(fp, fieldnames=fields)
        writer.writeheader()
        writer.writerows(unmatched)

    matched_count = sum(1 for r in rows if r["site_data"].get("pages"))
    total_downloaded = sum(int((r.get("download") or {}).get("downloaded", 0)) for r in rows)
    total_failed = sum(int((r.get("download") or {}).get("failed", 0)) for r in rows)

    summary = {
        "article_total": len(rows),
        "article_matched": matched_count,
        "article_unmatched": len(rows) - matched_count,
        "online_fashion_url_index_count": len(url_index),
        "unique_pages_fetched": len(parsed_pages),
        "page_fetch_errors": len(fetch_errors),
        "image_downloaded": total_downloaded,
        "image_failed": total_failed,
        "outputs": {
            "json": str(json_path),
            "csv": str(csv_path),
            "unmatched_csv": str(unmatched_path),
            "url_index_json": str(out_dir / "online_fashion_url_index.json"),
        },
    }
    (out_dir / "run_summary.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(json.dumps(summary, ensure_ascii=False, indent=2), flush=True)

    if args.mode == "all":
        print("[all] Starting image downloads...", flush=True)
        img_client = HttpClient(
            timeout=args.timeout,
            retries=max(1, args.retries),
            delay=0.0,
            use_curl_fallback=bool(args.curl_fallback),
        )
        res = download_images_from_json(
            client=img_client,
            article_cards_json=json_path,
            out_dir=out_dir,
            workers=max(4, args.workers),
            overwrite=args.overwrite_images,
        )
        (out_dir / "image_download_summary.json").write_text(
            json.dumps(res, ensure_ascii=False, indent=2), encoding="utf-8"
        )
        print(json.dumps(res, ensure_ascii=False, indent=2), flush=True)


if __name__ == "__main__":
    main()

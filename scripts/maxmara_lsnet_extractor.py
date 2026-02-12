#!/usr/bin/env python3
"""Extract Max Mara cards from LS.NET.RU (api2.ls.net.ru/apix/v2).

This is intentionally separate from maxmara_online_fashion_extractor.py to avoid conflicts.

Workflow:
- Parse source XLS (.xls) for unique Style articles.
- For each article, query LS catalog search restricted to brand Max Mara (brand id 473).
- Score candidates using SKU tokens (MODEL CODE COLOR) vs invoice fields.
- Fetch full product details for top candidates.
- Output JSON/CSV plus optional image downloads.

Outputs (default out dir: outputs/maxmara_lsnet):
- article_cards_full_lsnet.json
- article_cards_full_lsnet.csv
- article_cards_unmatched_lsnet.csv
- run_summary_lsnet.json
- images/lsnet/<style>/<productId>/...

Dependencies:
- stdlib + xlrd==2.0.1 for .xls
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
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

LS_API_BASE = "https://api2.ls.net.ru/apix/v2"
LS_BRAND_ID_MAXMARA = "473"


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


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
    def __init__(self, timeout: float, retries: int, delay: float) -> None:
        self.timeout = timeout
        self.retries = retries
        self.delay = delay
        self.opener = build_opener()

    def get_bytes(self, url: str) -> bytes:
        last_exc: Optional[Exception] = None
        for attempt in range(self.retries + 1):
            try:
                req = Request(
                    url,
                    headers={
                        "User-Agent": UA,
                        "Accept": "application/json,text/plain,*/*",
                        "X-Platform": "web",
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
                raise
        if last_exc:
            raise last_exc
        raise RuntimeError("unexpected fetch state")

    def get_json(self, url: str) -> Any:
        data = self.get_bytes(url)
        return json.loads(data.decode("utf-8", "ignore"))


@dataclass
class ArticleSeed:
    style: str
    commercial_style: str
    name: str
    var_comm_codes: List[str]
    var_descriptions: List[str]
    sizes: List[str]
    eans: List[str]
    total_qty: int


def parse_xls_articles(path: Path) -> List[ArticleSeed]:
    wb = xlrd.open_workbook(str(path))
    sh = wb.sheet_by_index(0)
    headers = [str(sh.cell_value(0, c)).strip() for c in range(sh.ncols)]
    idx = {h: i for i, h in enumerate(headers)}

    required = ["Style", "Commercial Style", "Name", "Var Comm", "Var Description OE", "Sizing", "Ean Code", "Qta"]
    for col in required:
        if col not in idx:
            raise ValueError(f"Missing expected column in XLS: {col}")

    by_style: Dict[str, Dict[str, Any]] = {}

    def add_set(bucket: Dict[str, set], key: str, value: str) -> None:
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
            },
        )

        sets: Dict[str, set] = bucket["sets"]
        add_set(sets, "var_comm_codes", str(sh.cell_value(r, idx["Var Comm"])))
        add_set(sets, "var_descriptions", str(sh.cell_value(r, idx["Var Description OE"])))
        add_set(sets, "sizes", str(sh.cell_value(r, idx["Sizing"])))
        add_set(sets, "eans", str(sh.cell_value(r, idx["Ean Code"])))

        q = parse_number(str(sh.cell_value(r, idx["Qta"]))) or 0.0
        bucket["qty"] += int(round(q))

    out: List[ArticleSeed] = []
    for _, item in sorted(by_style.items()):
        sets = item["sets"]
        out.append(
            ArticleSeed(
                style=item["style"],
                commercial_style=item["commercial_style"],
                name=item["name"],
                var_comm_codes=sorted(sets.get("var_comm_codes", set())),
                var_descriptions=sorted(sets.get("var_descriptions", set())),
                sizes=sorted(sets.get("sizes", set())),
                eans=sorted(sets.get("eans", set())),
                total_qty=item["qty"],
            )
        )

    return out


SKU_SPLIT_RE = re.compile(r"\s+")


def sku_tokens(sku: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    """Best-effort parse of LS sku: MODEL CODE COLOR."""
    sku = normalize_space(sku)
    if not sku:
        return None, None, None
    parts = SKU_SPLIT_RE.split(sku)
    if len(parts) >= 3:
        model = parts[0]
        code = parts[1]
        color = parts[2]
        return model, code, color
    return parts[0], None, None


def style_base_and_suffix(style: str) -> Tuple[Optional[str], Optional[str]]:
    s = re.sub(r"\D+", "", style or "")
    if len(s) >= 13:
        return s[:10], s[-3:]
    if len(s) >= 10:
        return s[:10], None
    return None, None


def build_search_terms(article: ArticleSeed) -> List[str]:
    terms: List[str] = []

    name = normalize_space(article.name)
    if name:
        terms.append(name)

    # Search by commercial style + color code is often too broad, but helps if name search fails.
    cs = re.sub(r"\D+", "", article.commercial_style or "")
    var = next((v for v in article.var_comm_codes if v.isdigit()), None)
    if cs and var:
        terms.append(f"{cs} {var}")

    base10, suf3 = style_base_and_suffix(article.style)
    if base10 and suf3:
        terms.append(f"{base10} {suf3}")

    # De-dup preserving order
    seen = set()
    out: List[str] = []
    for t in terms:
        if t in seen:
            continue
        seen.add(t)
        out.append(t)
    return out


def ls_catalog_search_url(term: str, limit: int, page: int, brand_id: str) -> str:
    qs = urlencode(
        {
            "search": term,
            "brands": brand_id,
            "limit": str(limit),
            "page": str(page),
        }
    )
    return f"{LS_API_BASE}/catalog/products?{qs}"


def ls_product_url(product_id: str) -> str:
    return f"{LS_API_BASE}/product/{product_id}"


def score_candidate(article: ArticleSeed, cand: Dict[str, Any]) -> int:
    score = 0

    sku = normalize_space(str(cand.get("sku") or ""))
    model, code, color = sku_tokens(sku)

    name = normalize_space(article.name).upper()
    if model and model.upper() == name:
        score += 10
    elif model and name and name in model.upper():
        score += 6

    # Style/commercial base code match
    st_base, st_suf = style_base_and_suffix(article.style)
    cs_base, cs_suf = style_base_and_suffix(article.commercial_style)

    if code:
        if st_base and code.startswith(st_base):
            score += 5
        if cs_base and code.startswith(cs_base):
            score += 4

    # Color code match (LS uses 3-digit color in SKU)
    vars3 = {v.zfill(3) for v in article.var_comm_codes if v.isdigit()}
    if color:
        if color in vars3:
            score += 3
        if st_suf and color == st_suf:
            score += 2
        if cs_suf and color == cs_suf:
            score += 2

    # Minor boosts
    if normalize_space(str(cand.get("brand") or "")).lower().startswith("max mara"):
        score += 1

    return score


def pick_top_candidates(article: ArticleSeed, catalog_items: List[Dict[str, Any]], top_n: int) -> List[Dict[str, Any]]:
    scored = []
    for it in catalog_items:
        scored.append((score_candidate(article, it), it))
    scored.sort(key=lambda x: x[0], reverse=True)

    out: List[Dict[str, Any]] = []
    for s, it in scored[:top_n]:
        it2 = dict(it)
        it2["_score"] = s
        out.append(it2)
    return out


def download_ls_images(client: HttpClient, style: str, product: Dict[str, Any], out_dir: Path, overwrite: bool) -> Dict[str, Any]:
    product_id = str(product.get("id") or "")
    if not product_id:
        return {"downloaded": 0, "skipped": 0, "failed": 0, "dir": ""}

    root = out_dir / "images" / "lsnet" / safe_filename(style) / safe_filename(product_id)
    root.mkdir(parents=True, exist_ok=True)

    downloaded = 0
    skipped = 0
    failed = 0

    photos = product.get("photos")
    if not isinstance(photos, list):
        photos = []

    # LS photo objects carry multiple variants (initial/normal/large).
    # Downloading all of them explodes disk usage; default is "large" only.
    variants = product.get("_download_variants")
    if not isinstance(variants, list) or not variants:
        variants = ["large"]

    def iter_photo_urls(ph: Dict[str, Any]) -> Iterable[Tuple[str, str]]:
        for key in variants:
            u = ph.get(key)
            if isinstance(u, str) and u.startswith("http"):
                yield key, u

    for idx, ph in enumerate(photos):
        if not isinstance(ph, dict):
            continue
        for kind, url in iter_photo_urls(ph):
            ext = os.path.splitext(url.split("?", 1)[0])[1].lower() or ".jpg"
            fn = f"{idx:02d}__{kind}{ext}"
            dst = root / fn
            if dst.exists() and dst.stat().st_size > 0 and not overwrite:
                skipped += 1
                continue
            try:
                data = client.get_bytes(url)
                dst.write_bytes(data)
                downloaded += 1
            except Exception:
                failed += 1

    return {"downloaded": downloaded, "skipped": skipped, "failed": failed, "dir": str(root)}


def flatten_for_csv(rows: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for row in rows:
        best = (row.get("lsnet") or {}).get("best") or {}
        out.append(
            {
                "style": row.get("style", ""),
                "commercial_style": row.get("commercial_style", ""),
                "name": row.get("name", ""),
                "var_comm_codes": "; ".join(row.get("var_comm_codes", [])),
                "var_descriptions": "; ".join(row.get("var_descriptions", [])),
                "xls_sizes": "; ".join(row.get("sizes", [])),
                "total_qty": row.get("total_qty", 0),
                "matched": bool(best),
                "best_product_id": best.get("id", ""),
                "best_product_url": best.get("product_url", ""),
                "best_sku": best.get("sku", ""),
                "best_model": best.get("model", ""),
                "best_price": best.get("price", ""),
                "best_brand": (best.get("brand") or {}).get("name", ""),
                "best_season": best.get("season", ""),
                "best_description": best.get("description", ""),
                "best_photos": len(best.get("photos") or []) if isinstance(best.get("photos"), list) else 0,
                "candidate_count": len((row.get("lsnet") or {}).get("candidates") or []),
                "image_dir": (row.get("download") or {}).get("dir", ""),
            }
        )
    return out


def main() -> None:
    ap = argparse.ArgumentParser(description="Extract Max Mara cards from LS.NET.RU")
    ap.add_argument(
        "--xls",
        default="/Users/lemelson/ModaMia-Codex-2/NewFilesCardsMaxMaraETC/Fatture_2025AI_CLI - 2025-10-21T152454.177 (2).xls",
    )
    ap.add_argument("--out-dir", default="/Users/lemelson/ModaMia-Codex-2/outputs/maxmara_lsnet")
    ap.add_argument("--timeout", type=float, default=25.0)
    ap.add_argument("--retries", type=int, default=2)
    ap.add_argument("--delay", type=float, default=0.05)
    ap.add_argument("--search-limit", type=int, default=60)
    ap.add_argument("--search-pages", type=int, default=1)
    ap.add_argument("--top-n", type=int, default=3)
    ap.add_argument("--download-images", action="store_true")
    ap.add_argument("--overwrite-images", action="store_true")
    ap.add_argument(
        "--image-variants",
        default="large",
        help="Comma-separated photo variants to download per image: initial,normal,large. Default: large",
    )
    args = ap.parse_args()

    xls_path = Path(args.xls)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    client = HttpClient(timeout=args.timeout, retries=args.retries, delay=args.delay)
    image_variants = [v.strip() for v in str(args.image_variants).split(",") if v.strip()]
    image_variants = [v for v in image_variants if v in {"initial", "normal", "large"}] or ["large"]

    print("[1/5] Parse XLS...")
    articles = parse_xls_articles(xls_path)
    print(f"  unique articles: {len(articles)}")

    print("[2/5] Search catalog for candidates...")
    rows: List[Dict[str, Any]] = []
    unmatched: List[Dict[str, Any]] = []

    for idx, a in enumerate(articles, 1):
        terms = build_search_terms(a)
        all_items: List[Dict[str, Any]] = []
        term_debug: List[Dict[str, Any]] = []

        for term in terms[:3]:
            items_for_term: List[Dict[str, Any]] = []
            for page in range(1, max(1, args.search_pages) + 1):
                url = ls_catalog_search_url(term=term, limit=args.search_limit, page=page, brand_id=LS_BRAND_ID_MAXMARA)
                try:
                    data = client.get_json(url)
                except Exception as exc:
                    term_debug.append({"term": term, "page": page, "error": normalize_space(str(exc))})
                    continue
                items = data.get("productsData") if isinstance(data, dict) else None
                if isinstance(items, list):
                    for it in items:
                        if isinstance(it, dict) and it.get("id"):
                            items_for_term.append(it)
                # if nothing else, don't paginate
                if isinstance(data, dict) and data.get("is_there_more") is False:
                    break
            term_debug.append({"term": term, "items": len(items_for_term)})
            all_items.extend(items_for_term)

        # de-dup by id
        seen_ids = set()
        dedup_items: List[Dict[str, Any]] = []
        for it in all_items:
            pid = str(it.get("id"))
            if not pid or pid in seen_ids:
                continue
            seen_ids.add(pid)
            dedup_items.append(it)

        top = pick_top_candidates(a, dedup_items, top_n=max(1, args.top_n))

        row: Dict[str, Any] = {
            "style": a.style,
            "commercial_style": a.commercial_style,
            "name": a.name,
            "var_comm_codes": a.var_comm_codes,
            "var_descriptions": a.var_descriptions,
            "sizes": a.sizes,
            "eans": a.eans,
            "total_qty": a.total_qty,
            "lsnet": {
                "search_terms": terms,
                "search_debug": term_debug,
                "candidate_total": len(dedup_items),
                "candidates": top,
                "best": None,
            },
            "download": {"downloaded": 0, "skipped": 0, "failed": 0, "dir": ""},
        }

        if top:
            best_id = str(top[0].get("id"))
            try:
                best = client.get_json(ls_product_url(best_id))
                if isinstance(best, dict):
                    best["product_url"] = f"https://ls.net.ru/products/{best_id}-{best.get('url') or ''}".rstrip("-")
                    best["_download_variants"] = image_variants
                row["lsnet"]["best"] = best
                if args.download_images and isinstance(best, dict):
                    row["download"] = download_ls_images(
                        client=client,
                        style=a.style,
                        product=best,
                        out_dir=out_dir,
                        overwrite=args.overwrite_images,
                    )
            except Exception as exc:
                row["lsnet"]["best_error"] = normalize_space(str(exc))

        if not row["lsnet"].get("best"):
            unmatched.append(
                {
                    "style": a.style,
                    "commercial_style": a.commercial_style,
                    "name": a.name,
                    "var_comm_codes": "; ".join(a.var_comm_codes),
                    "var_descriptions": "; ".join(a.var_descriptions),
                }
            )

        rows.append(row)
        if idx % 5 == 0:
            print(f"  processed {idx}/{len(articles)}")

    print("[3/5] Write outputs...")
    json_path = out_dir / "article_cards_full_lsnet.json"
    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    csv_rows = flatten_for_csv(rows)
    csv_path = out_dir / "article_cards_full_lsnet.csv"
    if csv_rows:
        with csv_path.open("w", encoding="utf-8", newline="") as fp:
            w = csv.DictWriter(fp, fieldnames=list(csv_rows[0].keys()))
            w.writeheader()
            w.writerows(csv_rows)

    unmatched_path = out_dir / "article_cards_unmatched_lsnet.csv"
    with unmatched_path.open("w", encoding="utf-8", newline="") as fp:
        fields = ["style", "commercial_style", "name", "var_comm_codes", "var_descriptions"]
        w = csv.DictWriter(fp, fieldnames=fields)
        w.writeheader()
        w.writerows(unmatched)

    matched = sum(1 for r in rows if (r.get("lsnet") or {}).get("best"))
    summary = {
        "article_total": len(rows),
        "article_matched": matched,
        "article_unmatched": len(rows) - matched,
        "outputs": {
            "json": str(json_path),
            "csv": str(csv_path),
            "unmatched_csv": str(unmatched_path),
            "images_root": str(out_dir / "images" / "lsnet"),
        },
    }

    (out_dir / "run_summary_lsnet.json").write_text(
        json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print("[4/5] Summary")
    print(json.dumps(summary, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()

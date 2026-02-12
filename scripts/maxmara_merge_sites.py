#!/usr/bin/env python3
"""
Merge Max Mara site enrichment sources into a single cards JSON for import.

Base input: outputs/maxmara/article_cards_full.json (XLS + online-fashion.ru matches)
Enrichment: outputs/maxmara_lsnet/article_cards_full_lsnet.json (LS.NET API)

Output: outputs/maxmara/article_cards_full.combined.json

Policy:
- Keep existing online-fashion pages when present.
- For styles with no site pages, add one page built from LS.NET "best" product.
"""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from typing import Any, Dict, List, Optional


def normalize_space(v: Any) -> str:
    return re.sub(r"\s+", " ", str(v or "")).strip()


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


def pick_ls_price(best: Dict[str, Any]) -> Optional[float]:
    for k in ("actual_price", "personal_price", "price"):
        v = best.get(k)
        if isinstance(v, (int, float)) and v > 0:
            return float(v)
    return None


def pick_ls_images(best: Dict[str, Any]) -> List[Dict[str, str]]:
    photos = best.get("photos")
    if not isinstance(photos, list):
        return []
    out: List[Dict[str, str]] = []
    seen = set()
    for idx, ph in enumerate(photos):
        if not isinstance(ph, dict):
            continue
        # Prefer large -> normal -> initial
        url = ph.get("large") or ph.get("normal") or ph.get("initial")
        if not isinstance(url, str) or not url.startswith("http"):
            continue
        if url in seen:
            continue
        seen.add(url)
        fn = url.split("?", 1)[0].rsplit("/", 1)[-1]
        out.append({"url": url, "url_no_query": url.split("?", 1)[0], "kind": "detail", "filename": fn})
    # Stable sort: keep original order, but ensure at least 1.
    return out


def pick_ls_sizes(best: Dict[str, Any]) -> List[str]:
    sizes = best.get("sizes")
    if not isinstance(sizes, list):
        return []
    out: List[str] = []
    seen = set()
    for s in sizes:
        if not isinstance(s, dict):
            continue
        label = normalize_space(s.get("size") or s.get("normal_size") or "")
        if not label:
            continue
        key = label.upper()
        if key in seen:
            continue
        seen.add(key)
        out.append(label)
    return out


def pick_ls_color(best: Dict[str, Any]) -> str:
    alt = best.get("altData")
    if isinstance(alt, dict):
        c = normalize_space(alt.get("color") or "")
        if c:
            return c
    return ""


def build_ls_page(best: Dict[str, Any]) -> Dict[str, Any]:
    url = normalize_space(best.get("product_url") or "")
    meta_title = normalize_space(best.get("meta_title") or "")
    meta_description = normalize_space(best.get("meta_description") or "")
    model = normalize_space(best.get("model") or "")
    product_name_line = normalize_space(model or best.get("sku") or meta_title)
    sku = normalize_space(best.get("sku") or "")

    price = pick_ls_price(best)
    images = pick_ls_images(best)
    sizes = pick_ls_sizes(best)
    color = pick_ls_color(best)

    page: Dict[str, Any] = {
        "source": "lsnet",
        "url": url,
        "canonical": url,
        # Keep <title>/meta title separately; use og_title/model as the primary display name.
        "title": meta_title,
        "product_name_line": product_name_line,
        "sku": sku,
        "prices": [price] if price is not None else [],
        "currency": "RUB",
        "meta_description": meta_description,
        "og_title": model or product_name_line,
        "og_description": meta_description,
        "og_image": (images[0]["url"] if images else ""),
        "short_description": "",
        "detail_description": normalize_space(best.get("description") or meta_description),
        "detail_lines": [],
        "collection_line": normalize_space(best.get("model_full") or ""),
        "composition_line": "",
        "care_line": "",
        "model_params_line": "",
        "breadcrumbs": [],
        "images": images,
        "image_count": len(images),
        "sizes": sizes,
        "colors": [color] if color else [],
        "color_codes": [],
        "lsnet": {
            "id": best.get("id"),
            "price": best.get("price"),
            "actual_price": best.get("actual_price"),
            "personal_price": best.get("personal_price"),
            "discount": best.get("discount"),
            "barcode": best.get("barcode"),
            "category_name": best.get("category_name"),
        },
    }
    return page


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base", default="outputs/maxmara/article_cards_full.json")
    ap.add_argument("--lsnet", default="outputs/maxmara_lsnet/article_cards_full_lsnet.json")
    ap.add_argument("--out", default="outputs/maxmara/article_cards_full.combined.json")
    args = ap.parse_args()

    base_path = Path(args.base)
    lsnet_path = Path(args.lsnet)
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)

    base_rows: List[Dict[str, Any]] = json.loads(base_path.read_text("utf-8"))
    lsnet_rows: List[Dict[str, Any]] = json.loads(lsnet_path.read_text("utf-8"))

    by_style: Dict[str, Dict[str, Any]] = {}
    for r in lsnet_rows:
        style = normalize_space(r.get("style") or "")
        best = ((r.get("lsnet") or {}) if isinstance(r.get("lsnet"), dict) else {}).get("best")
        if not style or not isinstance(best, dict):
            continue
        by_style[style] = best

    added = 0
    for row in base_rows:
        style = normalize_space(row.get("style") or "")
        sd = ensure_site_data(row)
        pages = sd.get("pages") or []
        if isinstance(pages, list) and pages:
            continue
        best = by_style.get(style)
        if not best:
            continue
        page = build_ls_page(best)
        sd["pages"] = [page]
        sd["best_match"] = page
        added += 1

    out_path.write_text(json.dumps(base_rows, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(json.dumps({"styles": len(base_rows), "added_lsnet_pages": added, "out": str(out_path)}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

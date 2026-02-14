#!/usr/bin/env node
/**
 * Deactivate Max Mara products that were enriched from LS.NET with low-confidence matches.
 *
 * Why:
 * - Some invoice styles got matched to the same LS product (same URL/description),
 *   which creates "duplicate" items in catalog: same title/price/description repeated.
 *
 * Policy:
 * - Only consider styles whose combined site pages are LSNET-only (no online-fashion pages).
 * - Look up the top LSNET candidate score from outputs/maxmara_lsnet/article_cards_full_lsnet.json.
 * - If score < minScore (default 10), set product.isActive=false in src/data/products.json.
 *
 * Usage:
 *   node scripts/deactivate-lowconfidence-maxmara-lsnet.mjs --dry-run
 *   node scripts/deactivate-lowconfidence-maxmara-lsnet.mjs --min-score 10
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function getArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

const minScore = Number(getArg("--min-score", "10"));
const productsJsonPath = path.resolve(ROOT, getArg("--products-json", "src/data/products.json"));
const combinedCardsPath = path.resolve(
  ROOT,
  getArg("--combined-json", "outputs/maxmara/article_cards_full.combined.json")
);
const lsnetCardsPath = path.resolve(
  ROOT,
  getArg("--lsnet-json", "outputs/maxmara_lsnet/article_cards_full_lsnet.json")
);

function normalizeSpace(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function isMaxMaraProduct(p) {
  const slug = normalizeSpace(p?.slug || "").toLowerCase();
  const brand = normalizeSpace(p?.brand || "").toLowerCase();
  return slug.startsWith("maxmara-") || brand.startsWith("max mara");
}

async function main() {
  const [productsRaw, combinedRaw, lsnetRaw] = await Promise.all([
    fs.readFile(productsJsonPath, "utf-8"),
    fs.readFile(combinedCardsPath, "utf-8"),
    fs.readFile(lsnetCardsPath, "utf-8")
  ]);

  const products = JSON.parse(productsRaw);
  const combined = JSON.parse(combinedRaw);
  const lsnet = JSON.parse(lsnetRaw);

  const lsnetByStyle = new Map(lsnet.map((r) => [String(r.style || "").toUpperCase(), r]));

  const lsnetOnlyStyles = new Set();
  for (const row of combined) {
    const style = normalizeSpace(row?.style || "").toUpperCase();
    if (!style) continue;
    const pages = (row?.site_data?.pages || []).filter(Boolean);
    if (!pages.length) continue;
    const sources = Array.from(new Set(pages.map((p) => normalizeSpace(p?.source || ""))));
    if (sources.length === 1 && sources[0] === "lsnet") {
      lsnetOnlyStyles.add(style);
    }
  }

  const lowConfidence = [];
  for (const style of lsnetOnlyStyles) {
    const row = lsnetByStyle.get(style);
    const top = row?.lsnet?.candidates?.[0];
    const score = Number(top?._score || 0);
    if (!Number.isFinite(score)) continue;
    if (score < minScore) {
      lowConfidence.push({
        style,
        score,
        bestId: normalizeSpace(row?.lsnet?.best?.id || ""),
        bestSku: normalizeSpace(row?.lsnet?.best?.sku || ""),
        bestUrl: normalizeSpace(row?.lsnet?.best?.product_url || "")
      });
    }
  }

  const lowByStyle = new Map(lowConfidence.map((x) => [x.style, x]));

  let touched = 0;
  const deactivated = [];
  for (const p of products) {
    if (!isMaxMaraProduct(p)) continue;
    const sku = normalizeSpace(p?.sku || "").toUpperCase();
    if (!sku) continue;

    const match = lowByStyle.get(sku);
    if (!match) continue;

    if (p.isActive) {
      p.isActive = false;
      p.updatedAt = new Date().toISOString();
      touched += 1;
      if (deactivated.length < 100) {
        deactivated.push({
          sku,
          name: p.name,
          price: p.price,
          score: match.score,
          bestId: match.bestId,
          bestSku: match.bestSku
        });
      }
    }
  }

  if (!dryRun) {
    await fs.writeFile(productsJsonPath, JSON.stringify(products, null, 2) + "\n", "utf-8");
  }

  console.log(
    JSON.stringify(
      {
        dryRun,
        minScore,
        lsnetOnlyStyles: lsnetOnlyStyles.size,
        lowConfidenceStyles: lowConfidence.length,
        deactivated: touched,
        sample: deactivated.slice(0, 20)
      },
      null,
      2
    )
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


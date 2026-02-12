#!/usr/bin/env node
/**
 * Post-import fixer for Max Mara products imported from LS.NET pages.
 *
 * The existing importer builds product.name from siteBest.og_title.
 * For LS.NET we want a short name ("Футболка MaxMara"), not the SEO title.
 *
 * Usage:
 *   node scripts/fix-maxmara-lsnet-products.mjs --dry-run
 *   node scripts/fix-maxmara-lsnet-products.mjs
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

const productsJsonPath = path.resolve(ROOT, getArg("--products-json", "src/data/products.json"));
const lsnetJsonPath = path.resolve(
  ROOT,
  getArg("--lsnet-json", "outputs/maxmara_lsnet/article_cards_full_lsnet.json")
);

function normalizeSpace(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function cleanSeoTitleToName(seoTitle, fallback) {
  const s = normalizeSpace(seoTitle);
  if (!s) return fallback;

  // Typical LS.NET meta_title:
  // "Футболка MaxMara купить в Москве ... - цены в интернет-магазине LS.NET.RU"
  let out = s;
  out = out.replace(/\s+купить.*$/i, "").trim();
  out = out.replace(/\s*-\s*цены.*$/i, "").trim();
  out = out.replace(/\s*-\s*prices.*$/i, "").trim();
  return out || fallback;
}

function pickBestDisplayName(best) {
  const model = normalizeSpace(best?.model || "");
  if (model) return model;

  const seo = normalizeSpace(best?.meta_title || "");
  if (seo) return cleanSeoTitleToName(seo, "");

  const sku = normalizeSpace(best?.sku || "");
  if (sku) return sku;

  return "";
}

async function main() {
  const products = JSON.parse(await fs.readFile(productsJsonPath, "utf-8"));
  const lsnetRows = JSON.parse(await fs.readFile(lsnetJsonPath, "utf-8"));

  const byStyle = new Map();
  for (const row of lsnetRows) {
    const style = normalizeSpace(row?.style || "");
    const best = row?.lsnet?.best;
    if (!style || !best) continue;
    byStyle.set(style.toUpperCase(), best);
  }

  let updated = 0;
  const sample = [];

  for (const p of products) {
    const sku = normalizeSpace(p?.sku || "").toUpperCase();
    if (!sku) continue;
    if (!byStyle.has(sku)) continue;

    const best = byStyle.get(sku);
    const desiredName = pickBestDisplayName(best);
    if (!desiredName) continue;

    const currentName = normalizeSpace(p?.name || "");
    const looksSeo = /купить/i.test(currentName) || /LS\.NET/i.test(currentName);

    if (!currentName || looksSeo) {
      p.name = desiredName;
      p.updatedAt = new Date().toISOString();
      updated += 1;
      if (sample.length < 10) sample.push({ sku, before: currentName, after: desiredName });
    }
  }

  if (!dryRun) {
    await fs.writeFile(productsJsonPath, JSON.stringify(products, null, 2) + "\n", "utf-8");
  }

  console.log(JSON.stringify({ dryRun, updated, sample }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


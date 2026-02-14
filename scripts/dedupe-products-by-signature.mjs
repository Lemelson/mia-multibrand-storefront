#!/usr/bin/env node
/**
 * Deactivate duplicate products in src/data/products.json.
 *
 * "Duplicate" here means: same brand+name+price+description+gender+category,
 * and identical image *content* (hashes of localized files in public/).
 *
 * Why:
 * - Importers can create multiple SKUs that point to the same site page/images,
 *   which shows up in catalog as repeated cards.
 *
 * Policy:
 * - Keep exactly 1 active product per duplicate group (best candidate wins).
 * - Deactivate the rest (isActive=false) and bump updatedAt.
 *
 * Usage:
 *   node scripts/dedupe-products-by-signature.mjs --dry-run
 *   node scripts/dedupe-products-by-signature.mjs
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function getArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

const productsJsonPath = path.resolve(ROOT, getArg("--products-json", "src/data/products.json"));
const publicRoot = path.resolve(ROOT, getArg("--public-root", "public"));

function nowIso() {
  return new Date().toISOString();
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normLower(value) {
  return normalizeSpace(value).toLowerCase();
}

function isLocalMediaUrl(url) {
  return typeof url === "string" && url.startsWith("/media/");
}

function toPublicAbsolutePath(mediaUrl) {
  // mediaUrl like "/media/products/..."
  const rel = String(mediaUrl || "").replace(/^\//, "");
  return path.join(publicRoot, rel);
}

async function sha256File(absPath) {
  const buf = await fs.readFile(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

async function imageContentSignature(product) {
  const urls = [];
  for (const color of product.colors || []) {
    for (const u of color?.images || []) {
      if (u) urls.push(String(u));
    }
  }

  const parts = [];
  for (const url of urls) {
    if (isLocalMediaUrl(url)) {
      const abs = toPublicAbsolutePath(url);
      try {
        parts.push(await sha256File(abs));
      } catch {
        // Fallback to URL so missing files still produce a stable signature.
        parts.push(`url:${url}`);
      }
    } else {
      parts.push(`url:${url}`);
    }
  }

  // Order-insensitive signature: same set of images => same signature.
  parts.sort();
  return crypto.createHash("sha256").update(parts.join("\n")).digest("hex");
}

function colorsStructuralSignature(product) {
  const colors = Array.isArray(product.colors) ? product.colors : [];
  const colorSigs = colors.map((c) => {
    const sizes = Array.isArray(c?.sizes) ? c.sizes : [];
    const sizeSig = sizes
      .map((s) => `${normLower(s?.size)}:${s?.inStock ? "1" : "0"}`)
      .sort()
      .join(",");

    return `${normLower(c?.name)}|${normLower(c?.hex)}|${sizeSig}`;
  });
  colorSigs.sort();
  return colorSigs.join(";");
}

function baseProductSignature(product) {
  return [
    normLower(product.brand),
    normLower(product.name),
    String(product.price ?? ""),
    normLower(product.gender),
    normLower(product.category),
    normLower(product.description),
    colorsStructuralSignature(product)
  ].join("|");
}

function scoreCandidate(product) {
  // Higher is better.
  let score = 0;
  if (product.isActive) score += 1000;

  const name = normLower(product.name);
  const desc = normalizeSpace(product.description);
  const comp = normLower(product.composition);

  // Prefer more plausible compositions for denim items.
  if (name.includes("джинс") || name.includes("деним") || normLower(desc).includes("деним")) {
    if (comp.includes("хлопок") || comp.includes("cotton")) score += 50;
    if (comp.includes("шелк") || comp.includes("silk")) score -= 10;
    if (comp.includes("шерсть") || comp.includes("wool")) score -= 5;
  }

  // Prefer richer descriptions (often the "real" one).
  score += Math.min(desc.length, 800) / 100;

  // Stable tie-breakers.
  score += 0.001 * (Date.parse(product.createdAt || "") || 0);
  score += 0.000001 * Number(String(product.id || "").replace(/\D/g, "") || 0);
  return score;
}

async function main() {
  const raw = await fs.readFile(productsJsonPath, "utf-8");
  const products = JSON.parse(raw);
  const timestamp = nowIso();

  const signatures = new Map(); // sig -> array of indexes

  for (let i = 0; i < products.length; i += 1) {
    const p = products[i];
    if (!p || !p.isActive) continue;
    const baseSig = baseProductSignature(p);
    const imgSig = await imageContentSignature(p);
    const sig = `${baseSig}|img:${imgSig}`;

    const list = signatures.get(sig) || [];
    list.push(i);
    signatures.set(sig, list);
  }

  const dupGroups = [...signatures.entries()].filter(([, idxs]) => idxs.length > 1);
  dupGroups.sort((a, b) => b[1].length - a[1].length);

  let deactivated = 0;
  const sample = [];

  for (const [, idxs] of dupGroups) {
    const candidates = idxs.map((idx) => ({ idx, p: products[idx] }));
    candidates.sort((a, b) => scoreCandidate(b.p) - scoreCandidate(a.p));
    const keeper = candidates[0];
    const toDeactivate = candidates.slice(1);

    for (const { idx } of toDeactivate) {
      const p = products[idx];
      if (!p.isActive) continue;
      p.isActive = false;
      p.updatedAt = timestamp;
      deactivated += 1;
      if (sample.length < 50) {
        sample.push({
          keptSlug: keeper.p.slug,
          deactivatedSlug: p.slug,
          brand: p.brand,
          name: p.name,
          price: p.price
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
        products: products.length,
        duplicateGroups: dupGroups.length,
        deactivated,
        sample
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


#!/usr/bin/env node
/**
 * Sync Max Mara products from src/data/products.json into the configured Postgres DB.
 *
 * Why: production reads products from DB when DATABASE_URL is configured (see src/lib/server-data/storage.ts),
 * so pushing products.json alone doesn't make new cards appear in admin/site.
 *
 * Safe-ish: only touches products where slug starts with "maxmara-" or brand starts with "Max Mara".
 * Upserts by sku (unique) when available; otherwise falls back to id.
 *
 * Usage:
 *   node scripts/sync-maxmara-products-to-db.mjs --dry-run
 *   node scripts/sync-maxmara-products-to-db.mjs
 */

import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function normalizeSpace(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

async function loadEnvLocalIfNeeded() {
  // Prisma/Next typically loads .env; this repo uses .env.local.
  // Parse it minimally so scripts can run consistently.
  if (process.env.DATABASE_URL) return;

  const envPath = path.join(ROOT, ".env.local");
  try {
    const raw = await fs.readFile(envPath, "utf-8");
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx <= 0) continue;
      const key = trimmed.slice(0, idx).trim();
      let val = trimmed.slice(idx + 1).trim();
      // Strip surrounding quotes if present.
      if ((val.startsWith("\"") && val.endsWith("\"")) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore; caller will fail with a clear error if DB is not configured
  }
}

function toProductRecord(product, idOverride) {
  // Mirrors prisma/seed.ts -> toProductData(), but for single product.
  const createdAt = new Date(product.createdAt);
  const updatedAt = new Date(product.updatedAt);

  return {
    id: idOverride ?? product.id,
    sku: product.sku ?? null,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    description: product.description,
    composition: product.composition,
    care: product.care,
    category: product.category,
    gender: product.gender,
    price: product.price,
    oldPrice: product.oldPrice ?? null,
    colorsJson: product.colors,
    storesJson: product.stores,
    isNew: product.isNew,
    isActive: product.isActive,
    createdAt,
    updatedAt
  };
}

function isMaxMaraProduct(p) {
  const slug = normalizeSpace(p?.slug || "");
  const brand = normalizeSpace(p?.brand || "");
  return slug.toLowerCase().startsWith("maxmara-") || brand.toLowerCase().startsWith("max mara");
}

async function main() {
  await loadEnvLocalIfNeeded();

  if (!process.env.DATABASE_URL && !process.env.POSTGRES_PRISMA_URL && !process.env.POSTGRES_URL) {
    throw new Error("DB is not configured (missing DATABASE_URL/POSTGRES_* env).");
  }

  const productsPath = path.join(ROOT, "src/data/products.json");
  const products = JSON.parse(await fs.readFile(productsPath, "utf-8"));

  const maxmara = products.filter(isMaxMaraProduct);
  const prisma = new PrismaClient();

  let upserted = 0;
  const sample = [];

  try {
    for (const p of maxmara) {
      const sku = normalizeSpace(p.sku || "");
      // Avoid PK collisions with existing DB records that may use "p-XYZ" ids.
      const createId = sku ? `maxmara-${sku}` : `maxmara-${normalizeSpace(p.slug || p.id || "")}`;
      const data = toProductRecord(p, createId);

      if (!dryRun) {
        if (sku) {
          const updateData = { ...data };
          delete updateData.id;
          await prisma.product.upsert({
            where: { sku },
            create: data,
            update: updateData // do not attempt to update PK
          });
        } else {
          await prisma.product.upsert({
            where: { id: p.id },
            create: data,
            update: data
          });
        }
      }

      upserted += 1;
      if (sample.length < 10) sample.push({ sku: p.sku, slug: p.slug, id: p.id });
    }
  } finally {
    await prisma.$disconnect();
  }

  console.log(JSON.stringify({ dryRun, productsInJson: products.length, maxMaraInJson: maxmara.length, upserted, sample }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

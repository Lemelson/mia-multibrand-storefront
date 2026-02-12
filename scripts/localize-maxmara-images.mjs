#!/usr/bin/env node
/**
 * Localize (download + resize) Max Mara images into public/media/products, like Twinset.
 *
 * Why: Max Mara images are currently remote (cdn.ls.net.ru / online-fashion.ru). Next/Image has to
 * fetch + resize on-demand, which is slower than serving pre-generated local card/thumb/detail images.
 *
 * This script:
 * - downloads remote images
 * - generates detail/card/thumb WEBP variants
 * - rewrites product.colors[].images[] to local /media/products/.../detail/NN.webp
 * - updates JSON and/or DB (depending on DATA_SOURCE/db env)
 *
 * Requirements (local machine):
 * - `curl`
 * - ImageMagick `magick`
 *
 * Usage:
 *   node scripts/localize-maxmara-images.mjs --dry-run
 *   node scripts/localize-maxmara-images.mjs
 *
 * Options:
 *   --refresh          re-generate files even if present
 *   --only-slug <s>    process only one product slug
 *   --limit <n>        process first N maxmara products (after filtering)
 *   --max-images <n>   cap images per color (default 12)
 */

import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import { spawn } from "child_process";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUTPUT_BASE_URL = "/media/products";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PROFILE = {
  // Note: we do NOT upscale (`>` in resize), so LS.NET 870px stays ~870.
  detail: { width: 1200, quality: 82 },
  card: { width: 640, quality: 72 },
  thumb: { width: 160, quality: 65 }
};

const args = process.argv.slice(2);
const refresh = args.includes("--refresh");
const dryRun = args.includes("--dry-run");

function getArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

const onlySlug = getArg("--only-slug", "");
const limit = Number.parseInt(getArg("--limit", "0"), 10) || 0;
const maxImages = Number.parseInt(getArg("--max-images", "12"), 10) || 12;

const concurrency = Number.parseInt(process.env.IMG_CONCURRENCY ?? "4", 10);
const dataSource = (process.env.DATA_SOURCE || "").toLowerCase();
const useDb = dataSource === "db";
let prisma = null;

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isRemoteHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isMaxMaraProduct(product) {
  const slug = normalizeSpace(product?.slug || "");
  const brand = normalizeSpace(product?.brand || "");
  return slug.toLowerCase().startsWith("maxmara-") || brand.toLowerCase().startsWith("max mara");
}

function toSafeSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function sha1(value) {
  return crypto.createHash("sha1").update(String(value)).digest("hex");
}

async function ensureDir(filePath) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
}

async function existsNonEmpty(filePath) {
  try {
    const stat = await fs.stat(filePath);
    return stat.isFile() && stat.size > 0;
  } catch {
    return false;
  }
}

function run(cmd, cmdArgs, { cwd } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, cmdArgs, { stdio: ["ignore", "pipe", "pipe"], cwd });
    let out = "";
    let err = "";
    child.stdout.on("data", (buf) => (out += buf.toString()));
    child.stderr.on("data", (buf) => (err += buf.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) return resolve({ out, err });
      reject(new Error(`${cmd} exited ${code}: ${err || out}`));
    });
  });
}

async function downloadToFile(url, outputPath) {
  await ensureDir(outputPath);
  await run("curl", ["-sS", "-L", "--max-time", "40", "-A", UA, "-o", outputPath, url]);
  const ok = await existsNonEmpty(outputPath);
  if (!ok) {
    throw new Error("Empty download");
  }
}

async function magickResizeToWebp(inputPath, outputPath, width, quality) {
  await ensureDir(outputPath);
  // `-resize <w>x>` means resize by width; `>` prevents upscaling.
  const resizeArg = `${Math.max(1, width)}x>`;
  const q = String(Math.max(1, Math.min(100, quality)));
  await run("magick", [
    inputPath,
    "-auto-orient",
    "-strip",
    "-filter",
    "Lanczos",
    "-resize",
    resizeArg,
    "-quality",
    q,
    outputPath
  ]);
  const ok = await existsNonEmpty(outputPath);
  if (!ok) {
    throw new Error("Empty resize output");
  }
}

function scoreSourceUrl(url) {
  const u = String(url || "");
  // Prefer largest known variants.
  if (u.includes("/1200_1600_1/")) return 100;
  if (u.includes("/870x/")) return 90;
  if (u.includes("/600_800_1/")) return 80;
  if (u.includes("/450_600_1/")) return 70;
  if (u.includes("/390_520_1/")) return 60;
  if (u.includes("/200_266_1/")) return 50;
  return 10;
}

function angleKey(url) {
  try {
    const parsed = new URL(url);
    const base = path.basename(parsed.pathname);
    // For online-fashion, base name already encodes angle index: NAME_COLOR_1.webp
    // Strip extension only.
    return base.replace(/\.(jpg|jpeg|png|webp)$/i, "");
  } catch {
    return String(url || "");
  }
}

function dedupeAngles(urls, cap) {
  const buckets = new Map(); // key -> [{url,score}]
  for (const u of urls) {
    if (!isRemoteHttpUrl(u)) continue;
    const key = angleKey(u);
    const list = buckets.get(key) || [];
    list.push({ url: u, score: scoreSourceUrl(u) });
    buckets.set(key, list);
  }

  const out = [];
  for (const [key, list] of buckets.entries()) {
    list.sort((a, b) => b.score - a.score);
    out.push({ key, url: list[0].url });
  }

  // Keep stable-ish order by numeric suffix if present, else insertion order.
  out.sort((a, b) => {
    const am = /_(\d+)$/.exec(a.key);
    const bm = /_(\d+)$/.exec(b.key);
    const an = am ? Number(am[1]) : 9999;
    const bn = bm ? Number(bm[1]) : 9999;
    if (an !== bn) return an - bn;
    return a.key.localeCompare(b.key);
  });

  return out.slice(0, Math.max(1, cap));
}

async function runPool(items, limit, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      await worker(items[index], index);
    }
  });
  await Promise.all(workers);
}

async function loadEnvLocalIfNeeded() {
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
      if (
        (val.startsWith("\"") && val.endsWith("\"")) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) process.env[key] = val;
    }
  } catch {
    // ignore
  }
}

function preferDirectUrlForLocalPrisma() {
  // In some setups Prisma can't reliably connect via pooled DATABASE_URL (pgbouncer).
  // If DIRECT_URL is present, use it for this one-off script run.
  const direct = process.env.DIRECT_URL;
  if (!direct) return;
  const db = String(process.env.DATABASE_URL || "");
  if (!db || /pgbouncer=true/i.test(db)) {
    process.env.DATABASE_URL = direct;
  }
}

async function main() {
  if (useDb) {
    await loadEnvLocalIfNeeded();
    preferDirectUrlForLocalPrisma();
    prisma = new PrismaClient();
  }

  let products;
  if (useDb) {
    const rows = await prisma.product.findMany({
      select: { id: true, slug: true, brand: true, colorsJson: true }
    });
    products = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      brand: row.brand,
      colors: Array.isArray(row.colorsJson) ? row.colorsJson : []
    }));
  } else {
    products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf8"));
  }

  let maxmara = products.filter(isMaxMaraProduct);
  if (onlySlug) {
    maxmara = maxmara.filter((p) => normalizeSpace(p.slug) === normalizeSpace(onlySlug));
  }
  if (limit > 0) {
    maxmara = maxmara.slice(0, limit);
  }

  const tasks = [];
  const tmpRoot = path.join(ROOT, "outputs", "maxmara_localize_tmp");

  for (const product of maxmara) {
    const slugSeg = toSafeSegment(product.slug || product.id || "product");

    for (const color of product.colors || []) {
      const colorSeg = toSafeSegment(color.id || color.name || "color");
      const originalImages = Array.isArray(color.images) ? color.images : [];
      const angles = dedupeAngles(originalImages, maxImages);

      const nextLocalImages = [];

      for (let i = 0; i < angles.length; i += 1) {
        const source = angles[i].url;
        const indexSeg = String(i + 1).padStart(2, "0");
        const baseDir = `${OUTPUT_BASE_URL}/${slugSeg}/${colorSeg}`;

        const detailUrl = `${baseDir}/detail/${indexSeg}.webp`;
        const cardUrl = `${baseDir}/card/${indexSeg}.webp`;
        const thumbUrl = `${baseDir}/thumb/${indexSeg}.webp`;

        tasks.push({
          product,
          color,
          source,
          detailUrl,
          cardUrl,
          thumbUrl,
          detailPath: path.join(PUBLIC_DIR, detailUrl.replace(/^\//, "")),
          cardPath: path.join(PUBLIC_DIR, cardUrl.replace(/^\//, "")),
          thumbPath: path.join(PUBLIC_DIR, thumbUrl.replace(/^\//, "")),
          tmpPath: path.join(tmpRoot, `${sha1(source)}.img`),
          apply: () => {
            nextLocalImages.push(detailUrl);
          }
        });
      }

      // Apply after tasks run: set full images list deterministically.
      color.__nextLocalImages = nextLocalImages;
    }
  }

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  console.log(
    `Max Mara products: ${maxmara.length}; images to generate: ${tasks.length} (x${Object.keys(PROFILE).length} variants)`
  );
  console.log(
    `Concurrency: ${Math.max(1, concurrency)}; refresh: ${refresh ? "yes" : "no"}; dry-run: ${dryRun ? "yes" : "no"}`
  );

  await runPool(tasks, Math.max(1, concurrency), async (task, idx) => {
    const id = `${idx + 1}/${tasks.length}`;
    try {
      const variants = [
        { key: "detail", path: task.detailPath, url: task.detailUrl },
        { key: "card", path: task.cardPath, url: task.cardUrl },
        { key: "thumb", path: task.thumbPath, url: task.thumbUrl }
      ];

      const allPresent =
        !refresh &&
        (await existsNonEmpty(task.detailPath)) &&
        (await existsNonEmpty(task.cardPath)) &&
        (await existsNonEmpty(task.thumbPath));

      if (allPresent) {
        skipped += 1;
        task.apply();
        return;
      }

      if (!dryRun) {
        await downloadToFile(task.source, task.tmpPath);

        await magickResizeToWebp(
          task.tmpPath,
          task.detailPath,
          PROFILE.detail.width,
          PROFILE.detail.quality
        );
        await magickResizeToWebp(
          task.tmpPath,
          task.cardPath,
          PROFILE.card.width,
          PROFILE.card.quality
        );
        await magickResizeToWebp(
          task.tmpPath,
          task.thumbPath,
          PROFILE.thumb.width,
          PROFILE.thumb.quality
        );
      }

      ok += 1;
      task.apply();

      if ((idx + 1) % 40 === 0 || idx === tasks.length - 1) {
        console.log(`[${id}] ok`);
      }
    } catch (e) {
      failed += 1;
      console.error(`[${id}] failed: ${task.source}`);
      console.error(String(e?.message || e));
      // fallback: keep remote image by pushing it through
      try {
        task.color.__nextLocalImages.push(task.source);
      } catch {
        // ignore
      }
    }
  });

  // Apply rewritten images arrays
  for (const product of maxmara) {
    for (const color of product.colors || []) {
      if (Array.isArray(color.__nextLocalImages) && color.__nextLocalImages.length) {
        color.images = color.__nextLocalImages.slice();
      }
      delete color.__nextLocalImages;
    }
  }

  if (!dryRun) {
    if (useDb) {
      for (const product of maxmara) {
        await prisma.product.update({
          where: { id: product.id },
          data: {
            colorsJson: product.colors,
            updatedAt: new Date()
          }
        });
      }
    } else {
      // Update full JSON list (merge back into original products array)
      const byId = new Map(maxmara.map((p) => [p.id, p]));
      const nextProducts = products.map((p) => (byId.has(p.id) ? byId.get(p.id) : p));
      await fs.writeFile(PRODUCTS_PATH, `${JSON.stringify(nextProducts, null, 2)}\n`, "utf8");
    }
  }

  console.log(JSON.stringify({ ok, failed, skipped, total: tasks.length }, null, 2));
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    if (prisma) await prisma.$disconnect();
  });

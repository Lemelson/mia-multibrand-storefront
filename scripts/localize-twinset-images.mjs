#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const PUBLIC_DIR = path.join(ROOT, "public");
const OUTPUT_BASE_URL = "/media/products";
const TWINSET_HOST = "twinset-cdn.thron.com";

const PROFILE = {
  detail: { size: "960x1173", quality: "82" },
  card: { size: "640x782", quality: "72" },
  thumb: { size: "160x196", quality: "65" }
};

const args = new Set(process.argv.slice(2));
const refresh = args.has("--refresh");
const concurrency = Number.parseInt(process.env.IMG_CONCURRENCY ?? "8", 10);
const dataSource = (process.env.DATA_SOURCE || "json").toLowerCase();
const useDb = dataSource === "db" && Boolean(process.env.DATABASE_URL);
const prisma = useDb ? new PrismaClient() : null;

function isTwinsetUrl(value) {
  try {
    const url = new URL(value);
    return url.hostname.includes(TWINSET_HOST);
  } catch {
    return false;
  }
}

function toSafeSegment(value) {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

function buildVariantUrl(sourceUrl, variantKey) {
  const variant = PROFILE[variantKey];
  const parsed = new URL(sourceUrl);

  parsed.pathname = parsed.pathname.replace(/\/std\/\d+x\d+\//, `/std/${variant.size}/`);
  parsed.searchParams.set("quality", variant.quality);
  parsed.searchParams.set("format", "auto");

  return parsed.toString();
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

async function downloadToFile(url, outputPath) {
  const response = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
      Accept: "image/jpeg,image/*;q=0.9,*/*;q=0.8"
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content-type: ${contentType || "unknown"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("Empty image payload");
  }

  await ensureDir(outputPath);
  await fs.writeFile(outputPath, buffer);
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

async function main() {
  let products;
  if (useDb) {
    const rows = await prisma.product.findMany({
      select: {
        id: true,
        slug: true,
        colorsJson: true
      }
    });
    products = rows.map((row) => ({
      id: row.id,
      slug: row.slug,
      colors: Array.isArray(row.colorsJson) ? row.colorsJson : []
    }));
  } else {
    const raw = await fs.readFile(PRODUCTS_PATH, "utf8");
    products = JSON.parse(raw);
  }

  const tasks = [];

  for (const product of products) {
    const slug = toSafeSegment(product.slug || product.id || "product");

    for (const color of product.colors || []) {
      const colorSeg = toSafeSegment(color.id || color.name || "color");
      const originalImages = Array.isArray(color.images) ? color.images : [];

      for (let i = 0; i < originalImages.length; i += 1) {
        const source = originalImages[i];

        if (!isTwinsetUrl(source)) {
          continue;
        }

        const indexSeg = String(i + 1).padStart(2, "0");
        const baseDir = `${OUTPUT_BASE_URL}/${slug}/${colorSeg}`;

        const detailUrl = `${baseDir}/detail/${indexSeg}.jpg`;
        const cardUrl = `${baseDir}/card/${indexSeg}.jpg`;
        const thumbUrl = `${baseDir}/thumb/${indexSeg}.jpg`;

        tasks.push({
          source,
          detailUrl,
          cardUrl,
          thumbUrl,
          detailPath: path.join(PUBLIC_DIR, detailUrl.replace(/^\//, "")),
          cardPath: path.join(PUBLIC_DIR, cardUrl.replace(/^\//, "")),
          thumbPath: path.join(PUBLIC_DIR, thumbUrl.replace(/^\//, "")),
          apply: () => {
            color.images[i] = detailUrl;
          }
        });
      }
    }
  }

  let ok = 0;
  let failed = 0;
  let skipped = 0;

  console.log(`Found ${tasks.length} Twinset images to localize (${Object.keys(PROFILE).length} variants each).`);
  console.log(`Concurrency: ${Math.max(1, concurrency)}; refresh: ${refresh ? "yes" : "no"}`);

  await runPool(tasks, Math.max(1, concurrency), async (task, idx) => {
    const id = `${idx + 1}/${tasks.length}`;

    try {
      const variants = [
        { key: "detail", path: task.detailPath },
        { key: "card", path: task.cardPath },
        { key: "thumb", path: task.thumbPath }
      ];

      let allPresent = true;

      for (const variant of variants) {
        const ready = !refresh && (await existsNonEmpty(variant.path));
        if (!ready) {
          allPresent = false;
        }
      }

      if (allPresent) {
        skipped += 1;
        task.apply();
        if ((idx + 1) % 40 === 0) {
          console.log(`[${id}] skipped (already cached)`);
        }
        return;
      }

      for (const variant of variants) {
        const shouldSkip = !refresh && (await existsNonEmpty(variant.path));
        if (shouldSkip) {
          continue;
        }

        const variantUrl = buildVariantUrl(task.source, variant.key);
        await downloadToFile(variantUrl, variant.path);
      }

      ok += 1;
      task.apply();

      if ((idx + 1) % 20 === 0 || idx === tasks.length - 1) {
        console.log(`[${id}] downloaded`);
      }
    } catch (error) {
      failed += 1;
      console.error(`[${id}] failed: ${task.source}`);
      console.error(String(error?.message || error));
    }
  });

  if (useDb) {
    for (const product of products) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          colorsJson: product.colors,
          updatedAt: new Date()
        }
      });
    }
  } else {
    await fs.writeFile(PRODUCTS_PATH, `${JSON.stringify(products, null, 2)}\n`, "utf8");
  }

  const summary = {
    total: tasks.length,
    localized: ok,
    skipped,
    failed,
    updatedAt: new Date().toISOString(),
    profile: PROFILE
  };

  const summaryPath = path.join(ROOT, "outputs", "image_localize_summary.json");
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log("Done.");
  console.log(`Localized: ${ok}; skipped: ${skipped}; failed: ${failed}`);
  console.log(`Summary: ${summaryPath}`);

  if (failed > 0) {
    process.exitCode = 2;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(async () => {
  if (prisma) {
    await prisma.$disconnect();
  }
});

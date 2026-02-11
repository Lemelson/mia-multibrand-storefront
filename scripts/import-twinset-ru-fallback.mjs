#!/usr/bin/env node

import { promises as fs } from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const ROOT = process.cwd();

const args = process.argv.slice(2);
function getArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

const parsedJsonPath = path.resolve(
  ROOT,
  getArg("--parsed-json", "outputs/twinset_ru_fallback_full/twinset_ru_products.json")
);
const productsJsonPath = path.resolve(ROOT, getArg("--products-json", "src/data/products.json"));
const dataSource = (process.env.DATA_SOURCE || "json").toLowerCase();
const useDb = dataSource === "db" && Boolean(process.env.DATABASE_URL);
const prisma = useDb ? new PrismaClient() : null;
const dryRun = args.includes("--dry-run");
const includeMismatch = args.includes("--include-mismatch");
const cookieHeader = getArg("--cookie-header", process.env.TWINSET_RU_COOKIE_HEADER || "");

const STORES = [
  { storeId: "mantera-sirius", available: true },
  { storeId: "twinset-krasnaya-polyana", available: true }
];

function toSafeSegment(value, fallback = "item") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function ensureHex(value) {
  const raw = normalizeSpace(value);
  if (!raw || raw === "#") return "#1A1A1A";
  if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(raw) || /^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toUpperCase()}`;
  return "#1A1A1A";
}

function dedupeSizes(values) {
  const out = [];
  const seen = new Set();
  for (const item of values || []) {
    if (!item || typeof item !== "object") continue;
    const size = normalizeSpace(item.size);
    if (!size) continue;
    const key = size.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ size, inStock: Boolean(item.in_stock ?? item.inStock ?? true) });
  }
  return out;
}

function mapCategory(productName, categoryPath) {
  const hay = `${normalizeSpace(productName)} ${normalizeSpace(categoryPath)}`.toLowerCase();

  if (/(джинс)/.test(hay)) return "jeans";
  if (/(брюк|палаццо|джоггер|легинс)/.test(hay)) return "pants";
  if (/(юбк)/.test(hay)) return "skirts";
  if (/(плать|сарафан)/.test(hay)) return "dresses";
  if (/(пальто|пуховик|куртк|тренч|плащ|жилет|бомбер|ветровк)/.test(hay)) return "outerwear";
  if (/(джемпер|свитер|водолаз|кардиган|трикотаж|свитшот|худи)/.test(hay)) return "knitwear";
  if (/(рубаш|блуз|топ|футбол)/.test(hay)) return "shirts-blouses";
  if (/(ботин|сапог|туфл|кроссов|кед|лофер|босонож|сандал)/.test(hay)) return "shoes";
  if (/(сумк|ремень|шарф|палантин|кошел|очк|украшен|браслет|серьг|кольц|ожерель)/.test(hay)) return "accessories";
  return "accessories";
}

function buildDescription(name, description, category) {
  const desc = normalizeSpace(description);
  if (desc) return desc;

  if (category === "pants") return `Брюки Twinset Milano с выверенным кроем и комфортной посадкой на каждый день.`;
  if (category === "knitwear") return `Трикотажная модель Twinset Milano из мягкой смесовой пряжи для повседневных и вечерних образов.`;
  if (category === "outerwear") return `Модель верхней одежды Twinset Milano с акцентом на комфорт, посадку и силуэт.`;
  if (category === "dresses") return `Платье Twinset Milano для повседневных и вечерних образов.`;
  if (category === "shoes") return `Обувь Twinset Milano с удобной колодкой и фирменной эстетикой бренда.`;
  if (category === "accessories") return `Аксессуар Twinset Milano, который завершает образ и добавляет фирменный акцент.`;
  return `${name || "Модель Twinset Milano"} в актуальном силуэте сезона.`;
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

async function downloadImage(url) {
  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    Accept: "image/jpeg,image/webp,image/*;q=0.9,*/*;q=0.8"
  };
  if (cookieHeader) headers.Cookie = cookieHeader;

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  if (!contentType.startsWith("image/")) {
    throw new Error(`Unexpected content-type: ${contentType || "unknown"}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  if (!buffer.length) {
    throw new Error("Empty payload");
  }
  return buffer;
}

async function writeBuffer(filePath, buffer) {
  await ensureDir(filePath);
  await fs.writeFile(filePath, buffer);
}

async function downloadVariantWithFallback(primaryUrl, fallbackBuffer) {
  try {
    return await downloadImage(primaryUrl);
  } catch {
    return fallbackBuffer;
  }
}

function getStatuses() {
  return includeMismatch ? new Set(["ok", "ok_mismatch"]) : new Set(["ok"]);
}

function parseMaxId(products) {
  let max = 0;
  for (const product of products) {
    const match = /^p-(\d+)$/.exec(String(product.id || ""));
    if (!match) continue;
    max = Math.max(max, Number(match[1]));
  }
  return max;
}

function toId(value) {
  return `p-${String(value).padStart(3, "0")}`;
}

function toDetailWebPath(sku, colorId, idx) {
  return `/media/products/twinset-${sku.toLowerCase()}/${colorId}/detail/${String(idx).padStart(2, "0")}.jpg`;
}

function toVariantDiskPath(webPath) {
  return path.join(ROOT, "public", webPath.replace(/^\//, ""));
}

async function localizeColorImages(sku, colorId, imageVariants) {
  const detailWebPaths = [];

  for (let i = 0; i < imageVariants.length; i += 1) {
    const variant = imageVariants[i] || {};
    const idx = i + 1;

    const detailWeb = toDetailWebPath(sku, colorId, idx);
    const cardWeb = detailWeb.replace("/detail/", "/card/");
    const thumbWeb = detailWeb.replace("/detail/", "/thumb/");

    const detailPath = toVariantDiskPath(detailWeb);
    const cardPath = toVariantDiskPath(cardWeb);
    const thumbPath = toVariantDiskPath(thumbWeb);

    const detailUrl = variant.detail || variant.big || "";
    if (!detailUrl) {
      continue;
    }

    const detailReady = await existsNonEmpty(detailPath);
    const cardReady = await existsNonEmpty(cardPath);
    const thumbReady = await existsNonEmpty(thumbPath);

    if (!detailReady || !cardReady || !thumbReady) {
      const detailBuffer = detailReady ? await fs.readFile(detailPath) : await downloadImage(detailUrl);
      if (!detailReady) {
        await writeBuffer(detailPath, detailBuffer);
      }

      if (!cardReady) {
        const cardBuffer = await downloadVariantWithFallback(variant.card || detailUrl, detailBuffer);
        await writeBuffer(cardPath, cardBuffer);
      }

      if (!thumbReady) {
        const thumbBuffer = await downloadVariantWithFallback(variant.thumb || detailUrl, detailBuffer);
        await writeBuffer(thumbPath, thumbBuffer);
      }
    }

    detailWebPaths.push(detailWeb);
  }

  return detailWebPaths;
}

function selectPrice(product) {
  const primary = Number(product.price_value || 0);
  if (Number.isFinite(primary) && primary > 0) return Math.round(primary);
  return 0;
}

async function main() {
  const parsedRaw = await fs.readFile(parsedJsonPath, "utf8");
  const parsedRows = JSON.parse(parsedRaw);

  let products;
  if (useDb) {
    const existingProducts = await prisma.product.findMany({
      select: { id: true, sku: true }
    });
    products = existingProducts.map((item) => ({ id: item.id, sku: item.sku }));
  } else {
    const productsRaw = await fs.readFile(productsJsonPath, "utf8");
    products = JSON.parse(productsRaw);
  }

  const statusAllowed = getStatuses();
  const existingSkus = new Set(
    products.map((item) => normalizeSpace(item.sku || "").toUpperCase()).filter(Boolean)
  );

  let nextNumericId = parseMaxId(products) + 1;
  const created = [];
  const skipped = [];
  const failed = [];

  for (const row of parsedRows) {
    const status = String(row.status || "");
    if (!statusAllowed.has(status)) continue;

    const sku = normalizeSpace(row.article || row.product?.product_code).toUpperCase();
    if (!sku) {
      failed.push({ article: row.article || "", reason: "missing sku" });
      continue;
    }

    if (existingSkus.has(sku)) {
      skipped.push({ article: sku, reason: "already exists" });
      continue;
    }

    const productData = row.product || {};
    const name = normalizeSpace(productData.name || `Twinset ${sku}`);
    const category = mapCategory(name, productData.category_path || "");
    const description = buildDescription(name, productData.description || "", category);
    const composition = normalizeSpace(productData.composition || "") || "Состав уточняется.";
    const care =
      normalizeSpace(productData.care || "") ||
      "Рекомендуется деликатный уход согласно ярлыку изделия.";

    const price = selectPrice(productData);
    if (!price) {
      failed.push({ article: sku, reason: "missing price" });
      continue;
    }

    const oldPriceValue = Number(productData.old_price_value || 0);
    const oldPrice =
      Number.isFinite(oldPriceValue) && oldPriceValue > price ? Math.round(oldPriceValue) : undefined;

    const rawColors = Array.isArray(productData.colors) ? productData.colors : [];
    const fallbackSizes = dedupeSizes(productData.sizes || []);
    const colors = [];

    for (let colorIndex = 0; colorIndex < rawColors.length; colorIndex += 1) {
      const rawColor = rawColors[colorIndex] || {};
      const colorId = `p-${String(nextNumericId).padStart(3, "0")}-c${colorIndex + 1}`;
      const colorName = normalizeSpace(rawColor.name || productData.color_name || "Основной цвет");
      const colorHex = ensureHex(rawColor.hex || productData.color_hex || "");
      const sizes = dedupeSizes(rawColor.sizes || fallbackSizes);

      const imageVariants = Array.isArray(rawColor.image_variants)
        ? rawColor.image_variants
        : Array.isArray(productData.image_variants)
          ? productData.image_variants
          : (Array.isArray(rawColor.images) ? rawColor.images : []).map((url) => ({
              detail: url,
              card: url,
              thumb: url,
              big: url
            }));

      const images = await localizeColorImages(sku, colorId, imageVariants);
      if (!images.length) {
        failed.push({ article: sku, reason: `no images for color ${colorName}` });
        continue;
      }

      colors.push({
        id: colorId,
        name: colorName,
        hex: colorHex,
        images,
        sizes: sizes.length ? sizes : [{ size: "U", inStock: true }]
      });
    }

    if (!colors.length) {
      failed.push({ article: sku, reason: "no valid colors after image localization" });
      continue;
    }

    const now = new Date().toISOString();
    const id = toId(nextNumericId);
    nextNumericId += 1;

    const product = {
      id,
      sku,
      slug: `twinset-${sku.toLowerCase()}`,
      name,
      brand: "Twinset Milano",
      description,
      composition,
      care,
      category,
      gender: "women",
      price,
      ...(oldPrice ? { oldPrice } : {}),
      colors,
      stores: STORES,
      isNew: true,
      isActive: true,
      createdAt: now,
      updatedAt: now
    };

    created.push(product);
    existingSkus.add(sku);
  }

  if (!dryRun) {
    if (useDb) {
      for (const product of created) {
        await prisma.product.upsert({
          where: { id: product.id },
          create: {
            id: product.id,
            sku: product.sku,
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
            createdAt: new Date(product.createdAt),
            updatedAt: new Date(product.updatedAt)
          },
          update: {
            sku: product.sku,
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
            updatedAt: new Date(product.updatedAt)
          }
        });
      }
    } else {
      const nextProducts = [...created, ...products];
      await fs.writeFile(productsJsonPath, `${JSON.stringify(nextProducts, null, 2)}\n`, "utf8");
    }
  }

  const summary = {
    parsedJsonPath,
    productsTarget: useDb ? "database" : productsJsonPath,
    dryRun,
    includeMismatch,
    totalParsed: parsedRows.length,
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    createdSkus: created.map((item) => item.sku),
    skipped,
    failed,
    updatedAt: new Date().toISOString()
  };

  const summaryPath = path.join(ROOT, "outputs", "import_twinset_ru_fallback_summary.json");
  await fs.mkdir(path.dirname(summaryPath), { recursive: true });
  await fs.writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");

  console.log(`Parsed rows: ${parsedRows.length}`);
  console.log(`Created: ${created.length}`);
  console.log(`Skipped: ${skipped.length}`);
  console.log(`Failed: ${failed.length}`);
  console.log(`Summary: ${summaryPath}`);

  if (created.length) {
    console.log(`Created SKUs: ${created.map((item) => item.sku).join(", ")}`);
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

#!/usr/bin/env node
/**
 * Import Max Mara products from outputs/maxmara/article_cards_full.json
 * into src/data/products.json and localize images into public/media/products.
 *
 * This follows the existing Product JSON schema in src/lib/types.ts.
 *
 * Usage:
 *   node scripts/import-maxmara-online-fashion.mjs --dry-run
 *   node scripts/import-maxmara-online-fashion.mjs
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const includeUnmatched = args.includes("--include-unmatched");

function getArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

const cardsJsonPath = path.resolve(
  ROOT,
  getArg("--cards-json", "outputs/maxmara/article_cards_full.json")
);
const productsJsonPath = path.resolve(ROOT, getArg("--products-json", "src/data/products.json"));
const downloadedImagesRoot = path.resolve(ROOT, getArg("--downloaded-images", "outputs/maxmara/images/online-fashion"));
const publicRoot = path.resolve(ROOT, "public");

function nowIso() {
  return new Date().toISOString();
}

function normalizeSpace(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function toSafeSegment(value, fallback = "item") {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || fallback;
}

function ensureHex(value) {
  const raw = normalizeSpace(value);
  if (!raw || raw === "#") return "#1A1A1A";
  if (/^#[0-9a-f]{3}$/i.test(raw) || /^#[0-9a-f]{6}$/i.test(raw)) return raw.toUpperCase();
  if (/^[0-9a-f]{3}$/i.test(raw) || /^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toUpperCase()}`;
  return "#1A1A1A";
}

function isMostlyAscii(text) {
  const s = normalizeSpace(text);
  if (!s) return false;
  let ascii = 0;
  for (const ch of s) {
    if (ch.charCodeAt(0) <= 0x7f) ascii++;
  }
  return ascii / s.length > 0.92;
}

function translateFiberEn(text) {
  // Minimal, deterministic translation for common fibers and labels.
  let s = normalizeSpace(text);
  if (!s) return s;

  const map = [
    [/^fabric:\s*/i, "Ткань: "],
    [/^lining:\s*/i, "Подкладка: "],
    [/\bvirgin wool\b/gi, "шерсть virgin"],
    [/\bwool\b/gi, "шерсть"],
    [/\bcashmere\b/gi, "кашемир"],
    [/\bsilk\b/gi, "шелк"],
    [/\bcotton\b/gi, "хлопок"],
    [/\bviscose\b/gi, "вискоза"],
    [/\bpolyester\b/gi, "полиэстер"],
    [/\bpolyamide\b/gi, "полиамид"],
    [/\belastane\b/gi, "эластан"],
    [/\bacetate\b/gi, "ацетат"],
    [/\bleather\b/gi, "кожа"],
    [/\bmetal\b/gi, "металл"],
    [/\bglass\b/gi, "стекло"]
  ];

  for (const [re, rep] of map) {
    s = s.replace(re, rep);
  }

  return s;
}

function translateItemTypeEnToRu(type) {
  const t = normalizeSpace(type).toLowerCase();
  if (!t) return "";
  if (t.includes("skirt")) return "Юбка";
  if (t.includes("shirt")) return "Рубашка";
  if (t.includes("trouser") || t.includes("pants")) return "Брюки";
  if (t.includes("dress")) return "Платье";
  if (t.includes("jacket") || t.includes("coat") || t.includes("outer")) return "Верхняя одежда";
  if (t.includes("cardigan") || t.includes("sweater") || t.includes("knit")) return "Трикотаж";
  if (t.includes("shoe") || t.includes("sneaker") || t.includes("loafer") || t.includes("boot")) return "Обувь";
  if (t.includes("bag") || t.includes("scarf") || t.includes("poncho") || t.includes("accessor")) return "Аксессуары";
  return "";
}

function guessCategoryFromText(text) {
  const hay = normalizeSpace(text).toLowerCase();
  if (!hay) return "accessories";
  if (/(джинс)/.test(hay)) return "jeans";
  if (/(брюк|брюки|палаццо|джоггер|легинс|штаны|trouser|pants)/.test(hay)) return "pants";
  if (/(юбк|skirt)/.test(hay)) return "skirts";
  if (/(плать|сарафан|dress)/.test(hay)) return "dresses";
  if (/(пальто|пуховик|куртк|тренч|плащ|жилет|бомбер|ветровк|coat|jacket)/.test(hay))
    return "outerwear";
  if (/(джемпер|свитер|водолаз|кардиган|трикотаж|свитшот|худи|sweater|cardigan|knit)/.test(hay))
    return "knitwear";
  if (/(рубаш|блуз|топ|футбол|shirt|blouse|top|t-?shirt)/.test(hay)) return "shirts-blouses";
  if (/(ботин|сапог|туфл|кроссов|кед|лофер|босонож|сандал|shoe|sneaker|boot)/.test(hay))
    return "shoes";
  if (/(сумк|ремень|шарф|палантин|кошел|очк|украшен|браслет|серьг|кольц|ожерель|bag|scarf|jewelry)/.test(hay))
    return "accessories";
  return "accessories";
}

function guessHexFromColorName(name) {
  const v = normalizeSpace(name).toLowerCase();
  if (!v) return "#1A1A1A";

  const map = [
    ["черн", "#111111"],
    ["black", "#111111"],
    ["бел", "#f5f5f5"],
    ["white", "#f5f5f5"],
    ["бордо", "#5a0f1b"],
    ["борд", "#5a0f1b"],
    ["burgundy", "#5a0f1b"],
    ["красн", "#b00020"],
    ["red", "#b00020"],
    ["беж", "#d8c3a5"],
    ["beige", "#d8c3a5"],
    ["корич", "#6b4f3b"],
    ["brown", "#6b4f3b"],
    ["сер", "#8a8a8a"],
    ["grey", "#8a8a8a"],
    ["gray", "#8a8a8a"],
    ["син", "#234a8a"],
    ["blue", "#234a8a"],
    ["роз", "#d88aa6"],
    ["pink", "#d88aa6"],
    ["зелен", "#2f6b3f"],
    ["green", "#2f6b3f"],
    ["желт", "#d9b44a"],
    ["yellow", "#d9b44a"],
    ["фиолет", "#6a4c93"],
    ["purple", "#6a4c93"],
    ["золот", "#b8902f"],
    ["gold", "#b8902f"],
    ["сереб", "#aeb4bb"],
    ["silver", "#aeb4bb"]
  ];

  for (const [needle, hex] of map) {
    if (v.includes(needle)) return hex;
  }
  return "#1A1A1A";
}

function parseMaxId(products) {
  let max = 0;
  for (const product of products) {
    const m = /^p-(\d+)$/.exec(String(product.id || ""));
    if (!m) continue;
    max = Math.max(max, Number(m[1]));
  }
  return max;
}

function toId(n) {
  return `p-${String(n).padStart(3, "0")}`;
}

function pickBrandFromUrl(url, fallback = "Max Mara") {
  const u = String(url || "").toLowerCase();
  if (u.includes("max-mara-weekend")) return "Max Mara Weekend";
  if (u.includes("s-max-mara")) return "S Max Mara";
  return fallback;
}

async function existsNonEmpty(filePath) {
  try {
    const st = await fs.stat(filePath);
    return st.isFile() && st.size > 0;
  } catch {
    return false;
  }
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

function stripQuery(url) {
  const s = String(url || "");
  return s.split("?")[0];
}

function groupDownloadedImagesByBase(files) {
  // files: ["detail_1200__ALBIO_004_1.webp", "detail_600__ALBIO_004_1.webp", ...]
  // base key: "ALBIO_004_1"
  const buckets = new Map();
  for (const f of files) {
    const m = /^(?<kind>[^_]+(?:_[0-9]+)?)__+(?<name>.+)$/.exec(f);
    if (!m) continue;
    const kind = m.groups?.kind || "other";
    const name = m.groups?.name || f;
    const base = name.replace(/\.(jpg|jpeg|png|webp)$/i, "");
    const list = buckets.get(base) || [];
    list.push({ kind, file: f, name });
    buckets.set(base, list);
  }
  return buckets;
}

function sortBasesForGallery(bases) {
  // Attempt to preserve numeric suffix order: *_1, *_2, *_3...
  const scored = bases.map((b) => {
    const m = /_(\d+)$/.exec(b);
    const n = m ? Number(m[1]) : 9999;
    return { b, n };
  });
  scored.sort((a, c) => a.n - c.n || a.b.localeCompare(c.b));
  return scored.map((x) => x.b);
}

function pickBestVariantForBase(list) {
  const pref = ["detail_1200", "detail_600", "other", "mobile_450", "card_390", "card_300", "thumb_200", "thumb_90"];
  const byKind = new Map();
  for (const item of list) {
    if (!byKind.has(item.kind)) byKind.set(item.kind, item);
  }
  for (const k of pref) {
    if (byKind.has(k)) return byKind.get(k);
  }
  return list[0];
}

async function localizeImagesForColor({ style, productId, colorId, pageUrl }) {
  // Copy best-quality downloaded images into public/media/products/maxmara-<style>/<colorId>/{detail,card,thumb,original}/NN.ext
  const styleSeg = toSafeSegment(`maxmara-${style}`);
  const pageSlug = toSafeSegment(String(pageUrl || "").replace(/^https?:\/\//, "").replace(/\//g, "-"));
  const srcDir = path.join(downloadedImagesRoot, style, pageSlug);
  const imagesWebPaths = [];

  let entries = [];
  try {
    entries = await fs.readdir(srcDir);
  } catch {
    return { imagesWebPaths, srcDir, used: "none" };
  }

  const files = entries.filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));
  if (!files.length) {
    return { imagesWebPaths, srcDir, used: "none" };
  }

  const buckets = groupDownloadedImagesByBase(files);
  const orderedBases = sortBasesForGallery([...buckets.keys()]);

  // Keep all angles, but cap to something sane for UI
  const MAX_IMAGES = 12;
  const bases = orderedBases.slice(0, MAX_IMAGES);

  for (let i = 0; i < bases.length; i += 1) {
    const base = bases[i];
    const variants = buckets.get(base) || [];
    const chosen = pickBestVariantForBase(variants);
    if (!chosen) continue;

    const srcPath = path.join(srcDir, chosen.file);
    const ext = path.extname(chosen.file) || ".webp";
    const idx = String(i + 1).padStart(2, "0");

    const detailWeb = `/media/products/${styleSeg}/${colorId}/detail/${idx}${ext}`;
    const cardWeb = detailWeb.replace("/detail/", "/card/");
    const thumbWeb = detailWeb.replace("/detail/", "/thumb/");
    const originalWeb = detailWeb.replace("/detail/", "/original/");

    const detailDst = path.join(publicRoot, detailWeb.replace(/^\//, ""));
    const cardDst = path.join(publicRoot, cardWeb.replace(/^\//, ""));
    const thumbDst = path.join(publicRoot, thumbWeb.replace(/^\//, ""));
    const originalDst = path.join(publicRoot, originalWeb.replace(/^\//, ""));

    // We don't resize here; just duplicate the best source. Next.js will serve them as-is.
    await ensureDir(path.dirname(detailDst));
    await ensureDir(path.dirname(cardDst));
    await ensureDir(path.dirname(thumbDst));
    await ensureDir(path.dirname(originalDst));

    if (!dryRun) {
      const buf = await fs.readFile(srcPath);
      await fs.writeFile(detailDst, buf);
      await fs.writeFile(cardDst, buf);
      await fs.writeFile(thumbDst, buf);
      await fs.writeFile(originalDst, buf);
    }

    imagesWebPaths.push(detailWeb);
  }

  return { imagesWebPaths, srcDir, used: "downloaded" };
}

function buildComposition(row, siteBest) {
  const siteLine = normalizeSpace(siteBest?.composition_line || "");
  if (siteLine) return siteLine;

  const fromXls = normalizeSpace((row.composition_fabric || [])[0] || "");
  if (!fromXls) return "Состав: см. ярлык изделия.";

  // XLS is typically English like "100% Acetate"
  const translated = translateFiberEn(fromXls);
  return `Состав: ${translated}`;
}

function buildCare(row, siteBest) {
  const care = normalizeSpace(siteBest?.care_line || "");
  if (care) return care;
  return "Рекомендуется деликатный уход согласно ярлыку изделия.";
}

function buildDescription(row, siteBest) {
  const rich = normalizeSpace(siteBest?.detail_description || "");
  if (rich) return rich;

  const short = normalizeSpace(siteBest?.short_description || "");
  if (short) return short;

  // Fallback from XLS Item Description like "SHIRT" or "Skirt"
  const item = normalizeSpace((row.item_descriptions || [])[0] || "");
  const ruType = translateItemTypeEnToRu(item) || "Изделие";
  const name = normalizeSpace(row.name || "");
  return `${ruType} Max Mara ${name}.`;
}

function buildName(row, siteBest) {
  const ogTitle = normalizeSpace(siteBest?.og_title || "");
  if (ogTitle) {
    // Clean common suffixes
    return ogTitle
      .replace(/\s*-\s*купить.*$/i, "")
      .replace(/\s*\(.*?\)\s*$/i, (m) => m) // keep (id) if present
      .trim();
  }

  const item = normalizeSpace((row.item_descriptions || [])[0] || "");
  const ruType = translateItemTypeEnToRu(item);
  const model = normalizeSpace(row.name || "");
  return ruType ? `${ruType} Max Mara ${model}` : `Max Mara ${model}`;
}

function buildCategory(row, siteBest) {
  const crumbs = siteBest?.breadcrumbs || [];
  if (Array.isArray(crumbs) && crumbs.length) {
    const joined = crumbs.join(" ");
    return guessCategoryFromText(joined);
  }
  const item = normalizeSpace((row.item_descriptions || [])[0] || "");
  return guessCategoryFromText(item);
}

function toProductPrice(siteBest) {
  const prices = Array.isArray(siteBest?.prices) ? siteBest.prices : [];
  const p = Number(prices[0] || 0);
  if (Number.isFinite(p) && p > 0) return Math.round(p);
  return 0;
}

function buildColorNameFromRowAndSite(row, siteBest, pageIndex) {
  // Prefer site color (RU). If missing, use XLS Var Description OE (often EN).
  const siteColors = Array.isArray(siteBest?.colors) ? siteBest.colors : [];
  const v = normalizeSpace(siteColors.join(", "));
  if (v) return v;

  const xlsColors = Array.isArray(row.var_descriptions) ? row.var_descriptions : [];
  const fromXls = normalizeSpace(xlsColors[pageIndex] || xlsColors[0] || "");
  if (!fromXls) return "Цвет";

  if (isMostlyAscii(fromXls)) return translateFiberEn(fromXls); // cheap, but better than EN
  return fromXls;
}

async function main() {
  const cardsRaw = await fs.readFile(cardsJsonPath, "utf-8");
  const cards = JSON.parse(cardsRaw);

  const productsRaw = await fs.readFile(productsJsonPath, "utf-8");
  const products = JSON.parse(productsRaw);

  const existingSkus = new Set(
    products.map((p) => normalizeSpace(p.sku || "").toUpperCase()).filter(Boolean)
  );

  let nextNumericId = parseMaxId(products) + 1;
  const created = [];
  const skipped = [];
  const failed = [];

  const STORE_DEFAULTS = [
    { storeId: "mantera-sirius", available: true },
    { storeId: "twinset-krasnaya-polyana", available: false }
  ];

  for (const row of cards) {
    const style = normalizeSpace(row.style || "");
    if (!style) continue;

    const sitePages = ((row.site_data || {}).pages || []).filter(Boolean);
    if (!sitePages.length && !includeUnmatched) {
      skipped.push({ style, reason: "unmatched_no_site_data" });
      continue;
    }

    const sku = style.toUpperCase();
    if (existingSkus.has(sku)) {
      skipped.push({ style, reason: "sku_exists" });
      continue;
    }

    const productId = toId(nextNumericId++);
    const slug = `maxmara-${toSafeSegment(style)}`;
    const siteBest = sitePages[0] || null;

    const brand = pickBrandFromUrl(siteBest?.url, "Max Mara");
    const name = buildName(row, siteBest);
    const description = buildDescription(row, siteBest);
    const composition = buildComposition(row, siteBest);
    const care = buildCare(row, siteBest);
    const category = buildCategory(row, siteBest);
    const price = toProductPrice(siteBest);

    const colors = [];
    const pagesToUse = sitePages.length ? sitePages : [null];

    for (let i = 0; i < pagesToUse.length; i += 1) {
      const page = pagesToUse[i];
      const colorId = `${productId}-c${i + 1}`;
      const colorName = buildColorNameFromRowAndSite(row, page, i);
      const hex = ensureHex(guessHexFromColorName(colorName));

      let images = [];
      if (page?.url) {
        const localized = await localizeImagesForColor({
          style,
          productId,
          colorId,
          pageUrl: page.url
        });
        images = localized.imagesWebPaths;
      }

      if (!images.length && page?.images?.length) {
        // fallback to remote (detail only), keep unique no-query urls
        const seen = new Set();
        for (const img of page.images) {
          const u = stripQuery(img?.url || "");
          if (!u) continue;
          if (seen.has(u)) continue;
          seen.add(u);
          images.push(u);
        }
      }

      const sizes = [];
      const sizeList = Array.isArray(page?.sizes) && page.sizes.length ? page.sizes : row.sizes || [];
      const uniq = new Set();
      for (const s of sizeList) {
        const size = normalizeSpace(s);
        if (!size) continue;
        const key = size.toUpperCase();
        if (uniq.has(key)) continue;
        uniq.add(key);
        sizes.push({ size, inStock: true });
      }

      colors.push({
        id: colorId,
        name: colorName || "Цвет",
        hex,
        images,
        sizes
      });
    }

    const createdAt = nowIso();
    const product = {
      id: productId,
      sku,
      slug,
      name,
      brand,
      description,
      composition,
      care,
      category,
      gender: "women",
      price: Number.isFinite(price) && price > 0 ? price : 0,
      colors,
      stores: STORE_DEFAULTS,
      isNew: true,
      isActive: true,
      createdAt,
      updatedAt: createdAt
    };

    created.push({ style, productId, slug, colors: colors.length, hasImages: colors.some((c) => c.images?.length) });
    products.push(product);
    existingSkus.add(sku);
  }

  if (!dryRun) {
    await fs.writeFile(productsJsonPath, JSON.stringify(products, null, 2) + "\n", "utf-8");
  }

  const summary = {
    dryRun,
    includeUnmatched,
    created: created.length,
    skipped: skipped.length,
    failed: failed.length,
    outputs: { productsJsonPath },
    sampleCreated: created.slice(0, 10),
    sampleSkipped: skipped.slice(0, 10),
    sampleFailed: failed.slice(0, 10)
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});


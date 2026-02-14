#!/usr/bin/env node

/**
 * Parse missing Twinset SKUs from giglio.com using jina.ai reader proxy.
 *
 * Why: direct giglio.com requests from this environment fail (HTTP/2 INTERNAL_ERROR),
 * but https://r.jina.ai can fetch and render the page into a stable markdown-like text.
 *
 * Output:
 * - <outputDir>/twinset_giglio_parsed.json
 * - <outputDir>/twinset_giglio_not_found.json
 * - <outputDir>/twinset_giglio_summary.json
 * - (optional) <outputDir>/raw/<SKU>.txt
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();

const args = process.argv.slice(2);
function hasFlag(name) {
  return args.includes(name);
}
function getArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

function normalizeSku(value) {
  return String(value || "").trim().toUpperCase();
}

function dedupeKeepOrder(values) {
  const out = [];
  const seen = new Set();
  for (const value of values || []) {
    const v = String(value || "").trim();
    if (!v) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toSafeFilename(value) {
  return String(value || "")
    .trim()
    .replace(/[^0-9A-Za-z._-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "") || "item";
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function writeJson(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function exists(filePath) {
  try {
    await fs.stat(filePath);
    return true;
  } catch {
    return false;
  }
}

function parseCsvLine(line) {
  // Minimal CSV parser: handles quoted commas. Good enough for our mapping file.
  const out = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }
    if (!inQuotes && ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((v) => v.trim());
}

async function loadGiglioUrlMap(csvPath) {
  const raw = await fs.readFile(csvPath, "utf8");
  const lines = raw.split(/\r?\n/).filter(Boolean);
  if (!lines.length) return new Map();

  const headers = parseCsvLine(lines[0]).map((h) => h.trim());
  const idxArticle = headers.findIndex((h) => h === "article");
  const idxTop = headers.findIndex((h) => h === "giglio_top");
  if (idxArticle < 0 || idxTop < 0) {
    throw new Error(`Unexpected CSV headers in ${csvPath}`);
  }

  const map = new Map();
  for (const line of lines.slice(1)) {
    const cols = parseCsvLine(line);
    const article = normalizeSku(cols[idxArticle] || "");
    const url = String(cols[idxTop] || "").trim();
    if (!article || !url) continue;
    if (!map.has(article)) {
      map.set(article, url);
    }
  }
  return map;
}

function parseJinaReaderPayload(text) {
  const title = /(?:^|\n)Title:\s*([^\n]+)\n/.exec(text)?.[1]?.trim() || "";
  const urlSource = /(?:^|\n)URL Source:\s*([^\n]+)\n/.exec(text)?.[1]?.trim() || "";

  const mdIdx = text.indexOf("Markdown Content:");
  const markdown = mdIdx >= 0 ? text.slice(mdIdx + "Markdown Content:".length).trim() : "";

  return { title, urlSource, markdown };
}

function extractDesignerCode(markdown) {
  // Example: "Designer code: 252TP3322 00006"
  const match = /Designer code:\s*([0-9A-Za-z]+)\s+([0-9A-Za-z]+)\b/.exec(markdown);
  if (!match) return null;
  return { designerSku: match[1].toUpperCase(), designerColorCode: match[2].toUpperCase() };
}

function extractPrice(markdown) {
  // Examples:
  // - "price from~~$315.00~~**$173.25** / €145.93 -45%"
  // - "~~$235.00~~**$152.75** / €128.66 -35%"
  const lines = markdown.split(/\r?\n/).map((l) => l.trim());
  const line =
    lines.find((l) => /^price from/i.test(l)) ||
    lines.find((l) => l.includes("€") && l.includes("$") && (l.includes("~~") || l.includes("**")));
  if (!line) return null;

  const usdOld = /~~\$\s*([0-9.,]+)\s*~~/.exec(line)?.[1];
  const usdNow = /\*\*\$\s*([0-9.,]+)\s*\*\*/.exec(line)?.[1];
  const eurNow = /€\s*([0-9.,]+)/.exec(line)?.[1];
  const discountPct = /(-\d+%)/.exec(line)?.[1];

  const toNum = (v) => {
    if (!v) return null;
    const n = Number(String(v).replace(",", "."));
    return Number.isFinite(n) ? n : null;
  };

  return {
    usd: { old: toNum(usdOld), now: toNum(usdNow) },
    eur: { now: toNum(eurNow) },
    discount: discountPct || null,
    raw: line
  };
}

function extractComposition(markdown) {
  const match = /\*\*Composition\*\*\s*([^\n]+)\n/.exec(markdown);
  if (!match) return null;
  const value = match[1].trim();
  if (!value || value.toLowerCase() === "not available") return null;
  return value;
}

function extractDescriptionBullets(markdown) {
  const idx = markdown.indexOf("\nDESCRIPTION\n");
  if (idx < 0) return [];
  const slice = markdown.slice(idx + "\nDESCRIPTION\n".length);

  const lines = slice.split(/\r?\n/);
  const out = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^DETAILS AND CARE$/i.test(trimmed)) break;
    if (/^SIZE AND FIT$/i.test(trimmed)) break;

    // Common bullet style is: "• Style: Casual" (sometimes prefixed with weird char).
    if (/^-{3,}$/.test(trimmed)) {
      // Markdown underline after header ("-----------").
      continue;
    }
    const cleaned = trimmed.replace(/^[•\\-–\\u2022\\u00B7\\s]+/, "").trim();
    if (!cleaned) continue;
    out.push(cleaned);
  }
  return out;
}

function extractCategoryLeaf(markdown) {
  const line = markdown
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find((l) => l.startsWith("Category:"));
  if (!line) return null;

  // Prefer bracket link labels: Category: [Clothing](... )>[Skirt](...)
  const labels = [];
  const re = /\[([^\]]+)\]\([^)]+\)/g;
  let match;
  while ((match = re.exec(line))) {
    labels.push(match[1].trim());
  }
  if (labels.length) return labels[labels.length - 1];

  // Fallback: Category: Clothing>Skirt
  const raw = line.replace(/^Category:\s*/i, "");
  const parts = raw.split(">").map((p) => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : null;
}

function mapCategoryFromLeaf(leaf) {
  const value = String(leaf || "").trim().toLowerCase();
  if (!value) return "accessories";
  if (/(skirt)/.test(value)) return "skirts";
  if (/(dress)/.test(value)) return "dresses";
  if (/(pants|trousers|jeans)/.test(value)) return "pants";
  if (/(coat|jacket|outerwear|fur|down)/.test(value)) return "outerwear";
  if (/(sweater|jumper|cardigan|sweatshirt|knitwear)/.test(value)) return "knitwear";
  if (/(top|shirt|blouse)/.test(value)) return "shirts-blouses";
  if (/(handbag|bag)/.test(value)) return "bags";
  if (/(scarf|jewel|belt|accessor)/.test(value)) return "accessories";
  return "accessories";
}

function extractImages(markdown) {
  const urls = [];
  // Markdown image: ![alt](https://...)
  // Keep this as a regex literal (not a JS string) to avoid over-escaping.
  const re = /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g;
  let match;
  while ((match = re.exec(markdown))) {
    const url = match[1];
    if (!url) continue;
    // Product gallery images are Cloudinary transformations on media-catalog.giglio.com with t_prodZoom preset.
    if (!url.includes("media-catalog.giglio.com/")) continue;
    if (!url.includes("/images/")) continue;
    if (!url.includes("t_prodZoom")) continue;
    if (!url.includes("/products/")) continue;
    urls.push(url);
  }
  return dedupeKeepOrder(urls);
}

function extractColorFromTitle(title) {
  // Example: "Twinset Skirt woman - Black | 252TP3322 | GIGLIO.COM"
  const parts = String(title || "").split("|").map((p) => p.trim());
  const left = parts[0] || "";
  const m = /-\s*([^|-]+)\s*$/.exec(left);
  return m?.[1]?.trim() || "";
}

function extractProductName(markdown) {
  // Prefer the H1 after the "**[Twinset]**" marker.
  const lines = markdown.split(/\r?\n/);
  for (let i = 0; i < lines.length - 2; i += 1) {
    const a = lines[i].trim();
    const b = lines[i + 1].trim();
    const c = lines[i + 2].trim();
    if (a.startsWith("**[") && a.endsWith("**") && a.includes("](") && b && /^=+$/.test(c)) {
      return b;
    }
  }
  return "";
}

async function fetchJinaReader(url, { timeoutMs }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
        Accept: "text/plain, text/markdown;q=0.9, */*;q=0.8"
      }
    });
    const text = await res.text();
    return { status: res.status, text };
  } finally {
    clearTimeout(timer);
  }
}

function toJinaUrl(sourceUrl) {
  // Both of these work, but http://https:// form is more explicit.
  // Example: https://r.jina.ai/http://https://www.giglio.com/en-us/...
  return `https://r.jina.ai/http://${sourceUrl}`;
}

async function main() {
  const inputSkusPath = path.resolve(
    ROOT,
    getArg("--input-skus-json", "outputs/twinset_missing_excel_vs_db.json")
  );
  const mapCsvPath = path.resolve(ROOT, getArg("--giglio-map-csv", "outputs/fallback_probe_duckduckgo_fast.csv"));
  const outputDir = path.resolve(ROOT, getArg("--output-dir", "outputs/twinset_giglio_jina_pilot"));

  const limit = Number.parseInt(getArg("--limit", "10"), 10);
  const startIndex = Number.parseInt(getArg("--start-index", "0"), 10);
  const delayMs = Number.parseInt(getArg("--delay-ms", "1200"), 10);
  const timeoutMs = Number.parseInt(getArg("--timeout-ms", "45000"), 10);

  const saveRaw = hasFlag("--save-raw");
  const refresh = hasFlag("--refresh");

  const inputSkus = (await readJson(inputSkusPath)).map(normalizeSku).filter(Boolean);
  const giglioMap = await loadGiglioUrlMap(mapCsvPath);

  await fs.mkdir(outputDir, { recursive: true });
  const rawDir = path.join(outputDir, "raw");
  if (saveRaw) await fs.mkdir(rawDir, { recursive: true });

  const parsed = [];
  const notFound = [];
  const stats = { total: 0, ok: 0, noUrl: 0, httpError: 0, parseError: 0, skippedCached: 0 };

  const slice = inputSkus.slice(startIndex, startIndex + Math.max(0, limit));
  stats.total = slice.length;

  for (let i = 0; i < slice.length; i += 1) {
    const sku = slice[i];
    const id = `${startIndex + i + 1}/${inputSkus.length}`;

    const sourceUrl = giglioMap.get(sku) || "";
    if (!sourceUrl) {
      stats.noUrl += 1;
      notFound.push({ sku, status: "no_url", reason: "no giglio_top url in map csv" });
      continue;
    }

    const jinaUrl = toJinaUrl(sourceUrl);
    const rawPath = path.join(rawDir, `${toSafeFilename(sku)}.txt`);
    let payloadText = "";

    if (saveRaw && !refresh && (await exists(rawPath))) {
      payloadText = await fs.readFile(rawPath, "utf8");
      stats.skippedCached += 1;
    } else {
      const { status, text } = await fetchJinaReader(jinaUrl, { timeoutMs });
      if (status < 200 || status >= 300) {
        stats.httpError += 1;
        notFound.push({ sku, status: "http_error", httpStatus: status, sourceUrl, jinaUrl });
        continue;
      }
      payloadText = text;
      if (saveRaw) {
        await fs.writeFile(rawPath, payloadText, "utf8");
      }
      if (delayMs > 0) await sleep(delayMs);
    }

    try {
      const { title, urlSource, markdown } = parseJinaReaderPayload(payloadText);
      if (!markdown) {
        stats.parseError += 1;
        notFound.push({ sku, status: "parse_error", reason: "empty markdown payload", sourceUrl, jinaUrl });
        continue;
      }

      const designer = extractDesignerCode(markdown);
      const price = extractPrice(markdown);
      const composition = extractComposition(markdown);
      const descriptionBullets = extractDescriptionBullets(markdown);
      const images = extractImages(markdown);
      const colorFromTitle = extractColorFromTitle(title);
      const giglioCategoryLeaf = extractCategoryLeaf(markdown);
      const category = mapCategoryFromLeaf(giglioCategoryLeaf);
      const name = extractProductName(markdown);

      const item = {
        sku,
        status: "ok",
        sourceSite: "giglio.com",
        sourceUrl: urlSource || sourceUrl,
        title,
        name: name || null,
        color: colorFromTitle || null,
        giglioCategoryLeaf: giglioCategoryLeaf || null,
        category,
        designerCode: designer,
        price,
        composition,
        descriptionBullets,
        images,
        imageCount: images.length,
        rawPath: saveRaw ? path.relative(ROOT, rawPath) : null,
        fetchedAt: new Date().toISOString()
      };

      parsed.push(item);
      stats.ok += 1;

      console.log(`[${id}] ok ${sku}: images=${images.length} ${item.sourceUrl}`);
    } catch (error) {
      stats.parseError += 1;
      notFound.push({
        sku,
        status: "parse_error",
        sourceUrl,
        jinaUrl,
        reason: String(error?.message || error || "unknown")
      });
      console.error(`[${id}] parse_error ${sku}: ${String(error?.message || error)}`);
    }
  }

  const outParsed = path.join(outputDir, "twinset_giglio_parsed.json");
  const outNotFound = path.join(outputDir, "twinset_giglio_not_found.json");
  const outSummary = path.join(outputDir, "twinset_giglio_summary.json");

  await writeJson(outParsed, parsed);
  await writeJson(outNotFound, notFound);
  await writeJson(outSummary, { stats, outputDir: path.relative(ROOT, outputDir), createdAt: new Date().toISOString() });

  console.log("\nDone");
  console.log(`Output: ${outParsed}`);
  console.log(`Not found: ${outNotFound}`);
  console.log(`Summary: ${outSummary}`);
}

main().catch((error) => {
  console.error(String(error?.stack || error?.message || error));
  process.exitCode = 1;
});

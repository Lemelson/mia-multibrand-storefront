#!/usr/bin/env node

/**
 * Index giglio.com Twinset catalog pages via jina.ai to find URLs for missing SKUs,
 * then fetch each product page and parse details.
 *
 * Usage: node scripts/parse-missing-twinset-giglio-index.mjs
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const OUTPUT_DIR = path.join(ROOT, "outputs/twinset_giglio_index_run");

const MISSING_SKUS = [
  "252TP2622","252TP2172","252TP2171","252TP2060","252TF2120","252TF3041",
  "252TF2060","252LI3NAA","252LI3QCC","252TB7055","252TB7150","252TB7272",
  "252TB7170","252TA4490","252TA4300","252TO519B","252TT3540","252TO5390",
  "252TO5391","252TT3470","252TD8283","252TD8262","252TD8340","252TD8112",
  "252TF3023","252TGT024","252TGT012","252TGT01G","252TT2070","252TA4610",
  "252TCP190","252TCP032","252TA4500","252TT3215","252AT2200","252TD8110",
  "252TP3573","252TO519A","252TT2060","252TT3140",
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchJina(url) {
  const res = await fetch(`https://r.jina.ai/${url}`, {
    headers: { Accept: "text/plain" },
  });
  if (!res.ok) throw new Error(`Jina HTTP ${res.status}`);
  return res.text();
}

// Step 1: Index giglio catalog pages to find SKU -> URL mapping
async function indexGiglioCatalog() {
  const urlMap = new Map(); // sku_lower -> full_url
  const totalPages = 12;

  for (let page = 1; page <= totalPages; page++) {
    console.log(`  Indexing catalog page ${page}/${totalPages}...`);
    try {
      const text = await fetchJina(`https://www.giglio.com/en-us/twin-set/women.html?pag=${page}`);
      // Extract URLs containing twinset SKUs
      const urlRegex = /https:\/\/www\.giglio\.com\/en-[a-z]{2}\/[^\s\)\]"]*twinset[^\s\)\]"]*\.html/g;
      let match;
      while ((match = urlRegex.exec(text)) !== null) {
        const url = match[0].split("?")[0]; // strip query params
        // Extract SKU from URL: twinset-252tp2622.html or twinset-actitude-252at2110.html
        const skuMatch = url.match(/(?:twinset|actitude)-?(25[0-9][a-z0-9]{5,7})\.html/i);
        if (skuMatch) {
          urlMap.set(skuMatch[1].toLowerCase(), url);
        }
      }
    } catch (err) {
      console.error(`  Page ${page} error: ${err.message}`);
    }
    await sleep(2000);
  }

  console.log(`  Total unique SKU URLs indexed: ${urlMap.size}`);
  return urlMap;
}

// Step 2: Parse a product page fetched via jina
function parseGiglioPage(text, sku) {
  const result = {
    sku,
    status: "ok",
    sourceSite: "giglio.com",
    sourceUrl: "",
    title: "",
    name: "",
    color: "",
    giglioCategoryLeaf: "",
    category: "",
    designerCode: {},
    price: null,
    composition: null,
    descriptionBullets: [],
    images: [],
    imageCount: 0,
    fetchedAt: new Date().toISOString(),
  };

  // Title
  const titleMatch = text.match(/^Title:\s*(.+)$/m);
  if (titleMatch) result.title = titleMatch[1].trim();

  // Source URL
  const urlMatch = text.match(/^URL Source:\s*(.+)$/m);
  if (urlMatch) result.sourceUrl = urlMatch[1].trim();

  // Extract name and color from title: "Twinset Dress woman - Black | 252TP3084 | GIGLIO.COM"
  const nameColorMatch = result.title.match(/(?:Twinset\s+(?:Actitude\s+)?)([\w\s]+?)\s*-\s*([\w\s]+?)\s*\|/);
  if (nameColorMatch) {
    result.name = nameColorMatch[1].trim();
    result.color = nameColorMatch[2].trim();
  }

  // Category from name
  const catMap = {
    "Dress": "dresses", "Skirt": "skirts", "Sweater": "knitwear",
    "Sweatshirt": "knitwear", "Top": "shirts-blouses", "Jacket": "outerwear",
    "Coat": "outerwear", "Fur coat": "outerwear", "Jeans": "pants",
    "Pants": "pants", "Shorts": "pants", "Suit": "dresses",
    "Handbag": "bags", "Bag": "bags", "Scarf": "accessories",
    "Jewel": "accessories", "Belt": "accessories", "Hat": "accessories",
    "Gloves": "accessories", "Waistcoat": "outerwear", "Blouse": "shirts-blouses",
    "Shirt": "shirts-blouses", "Cardigan": "knitwear", "Jumpsuit": "dresses",
    "Bikini": "accessories", "Shoe": "accessories",
  };

  // Extract category leaf from name
  for (const [leaf, cat] of Object.entries(catMap)) {
    if (result.name.toLowerCase().includes(leaf.toLowerCase())) {
      result.giglioCategoryLeaf = leaf;
      result.category = cat;
      break;
    }
  }

  // Designer code
  const designerMatch = text.match(/Designer code[:\s]+([A-Z0-9]+)/i);
  if (designerMatch) {
    result.designerCode = { designerSku: designerMatch[1] };
  }

  // Price
  const priceNow = text.match(/\$([0-9,.]+)\s*$/m);
  const priceOld = text.match(/~~\$([0-9,.]+)~~/);
  const discount = text.match(/-(\d+)%/);
  const priceEur = text.match(/€\s*([0-9,.]+)/);

  if (priceNow || priceEur) {
    result.price = {
      usd: {
        old: priceOld ? parseFloat(priceOld[1].replace(",", "")) : null,
        now: priceNow ? parseFloat(priceNow[1].replace(",", "")) : null,
      },
      eur: {
        now: priceEur ? parseFloat(priceEur[1].replace(",", "")) : null,
      },
      discount: discount ? `-${discount[1]}%` : null,
    };
  }

  // Composition
  const compMatch = text.match(/(?:Composition|Material)[:\s]*([^\n]+)/i);
  if (compMatch) {
    result.composition = compMatch[1].trim();
  }

  // Description bullets: "Style: Casual", "Materials: Wool", etc.
  const bulletRegex = /(?:Style|Logo|Neckline|Neck|Shoulders|Bottom|Model|Length|Occasion|Sleeves|Materials|Pattern|Waist|Closure|Pockets|Cuffs|Hood|Shape|Handle|Shoulder strap|Lining|Details|Measurements|Sustainable):\s*[^\n]+/g;
  let bulletMatch;
  while ((bulletMatch = bulletRegex.exec(text)) !== null) {
    result.descriptionBullets.push(bulletMatch[0].trim());
  }

  // Images from Giglio CDN
  const imgRegex = /https:\/\/media-catalog\.giglio\.com\/images\/[^\s\)\]"]+\.jpg/g;
  const seenImgs = new Set();
  let imgMatch;
  while ((imgMatch = imgRegex.exec(text)) !== null) {
    const url = imgMatch[0];
    // Only take product images (prodZoom/prodPage), skip thumbnails
    if ((url.includes("t_prodZoom") || url.includes("t_prodPage")) && !seenImgs.has(url)) {
      seenImgs.add(url);
      // Normalize to prodZoom for consistency
      result.images.push(url.replace("t_prodPage", "t_prodZoom"));
    }
  }

  // Also check for img.giglio.com images
  const imgRegex2 = /https:\/\/img\.giglio\.com\/imager\/[^\s\)\]"]+\.jpg/g;
  while ((imgMatch = imgRegex2.exec(text)) !== null) {
    const url = imgMatch[0];
    if (!seenImgs.has(url)) {
      seenImgs.add(url);
      result.images.push(url);
    }
  }

  result.imageCount = result.images.length;
  return result;
}

async function main() {
  console.log("=== Parse Missing Twinset SKUs via Giglio Index ===\n");
  console.log(`Missing SKUs to find: ${MISSING_SKUS.length}\n`);

  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.mkdir(path.join(OUTPUT_DIR, "raw"), { recursive: true });

  // Step 1: Index catalog
  console.log("Step 1: Indexing Giglio catalog...");
  const urlMap = await indexGiglioCatalog();

  // Save URL map
  const mapObj = Object.fromEntries(urlMap);
  await fs.writeFile(path.join(OUTPUT_DIR, "giglio_url_map.json"), JSON.stringify(mapObj, null, 2) + "\n");

  // Step 2: Check which missing SKUs we found
  const found = [];
  const notInCatalog = [];

  for (const sku of MISSING_SKUS) {
    const lower = sku.toLowerCase();
    if (urlMap.has(lower)) {
      found.push({ sku, url: urlMap.get(lower) });
    } else {
      notInCatalog.push(sku);
    }
  }

  console.log(`\nCatalog results: ${found.length} found, ${notInCatalog.length} not in catalog`);
  console.log(`Found: ${found.map(f => f.sku).join(", ")}`);
  console.log(`Not found: ${notInCatalog.join(", ")}\n`);

  // Step 3: Fetch each found product page
  console.log("Step 2: Fetching product pages...");
  const parsed = [];
  const errors = [];

  for (let i = 0; i < found.length; i++) {
    const { sku, url } = found[i];
    console.log(`  [${i + 1}/${found.length}] ${sku}: ${url}`);
    try {
      const text = await fetchJina(url);

      // Save raw
      await fs.writeFile(path.join(OUTPUT_DIR, "raw", `${sku}.txt`), text);

      const product = parseGiglioPage(text, sku);
      product.sourceUrl = url;
      parsed.push(product);
      console.log(`    ✓ ${product.name} | ${product.color} | ${product.imageCount} imgs`);
    } catch (err) {
      console.error(`    ✗ ${err.message}`);
      errors.push({ sku, url, error: err.message });
    }
    await sleep(2500);
  }

  // Step 4: Save results
  const notFound = notInCatalog.map(sku => ({
    sku,
    status: "not_in_giglio_catalog",
    reason: "SKU not found in any Giglio catalog page",
  }));

  await fs.writeFile(
    path.join(OUTPUT_DIR, "parsed.json"),
    JSON.stringify(parsed, null, 2) + "\n"
  );
  await fs.writeFile(
    path.join(OUTPUT_DIR, "not_found.json"),
    JSON.stringify([...notFound, ...errors.map(e => ({ sku: e.sku, status: "fetch_error", reason: e.error }))], null, 2) + "\n"
  );

  const summary = {
    total: MISSING_SKUS.length,
    foundInCatalog: found.length,
    parsedOk: parsed.length,
    parsedWithImages: parsed.filter(p => p.imageCount > 0).length,
    notInCatalog: notInCatalog.length,
    fetchErrors: errors.length,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(OUTPUT_DIR, "summary.json"),
    JSON.stringify(summary, null, 2) + "\n"
  );

  console.log("\n=== Summary ===");
  console.log(`Total missing: ${summary.total}`);
  console.log(`Found in catalog: ${summary.foundInCatalog}`);
  console.log(`Parsed OK: ${summary.parsedOk}`);
  console.log(`With images: ${summary.parsedWithImages}`);
  console.log(`Not in catalog: ${summary.notInCatalog}`);
  console.log(`Fetch errors: ${summary.fetchErrors}`);
  console.log(`\nResults in: ${OUTPUT_DIR}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});

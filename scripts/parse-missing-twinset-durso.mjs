#!/usr/bin/env node

/**
 * Index dursoboutique.com Twinset catalog to find missing SKUs,
 * then parse each product page for details and images.
 *
 * Usage: node scripts/parse-missing-twinset-durso.mjs
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const OUTPUT_DIR = path.join(ROOT, "outputs/twinset_durso_run");

const MISSING_SKUS = [
    "252TF2120","252LI3NAA","252LI3QCC","252TB7170","252TA4490","252TA4300",
    "252TT3540","252TO5390","252TO5391","252TT3470","252TD8340","252TA4500",
    "252AT2200",
    // Also try to find images for these (Giglio had data but no photos):
    "252TO519B","252TF3023","252TP3573","252TO519A","252TT2060","252TT3140",
];

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function fetchPage(url) {
    const res = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36",
            Accept: "text/html,application/xhtml+xml",
            "Accept-Language": "en-US,en;q=0.9",
        },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.text();
}

// Step 1: Index all catalog pages to build SKU → URL map
async function indexDursoCatalog() {
    const skuUrlMap = new Map();
    const totalPages = 16;

    for (let page = 1; page <= totalPages; page++) {
        console.log(`  Indexing page ${page}/${totalPages}...`);
        try {
            const html = await fetchPage(`https://www.dursoboutique.com/store/en/129-twinset?page=${page}`);

            // Extract product URLs and their SKUs
            // Pattern: href="/store/en/...-252XX####-ai25.html" or similar
            const linkRegex = /href="(\/store\/en\/[^"]*?-?(25[0-9][a-z0-9]{5,7})[^"]*?\.html)"/gi;
            let match;
            while ((match = linkRegex.exec(html)) !== null) {
                const url = `https://www.dursoboutique.com${match[1]}`;
                const sku = match[2].toUpperCase();
                if (!skuUrlMap.has(sku)) {
                    skuUrlMap.set(sku, url);
                }
            }

            // Also search for SKU patterns in text
            const skuRegex = /\b(252[A-Z]{2}[A-Z0-9]{4,5})\b/g;
            let skuMatch;
            while ((skuMatch = skuRegex.exec(html)) !== null) {
                // Already found via links above in most cases
            }
        } catch (err) {
            console.error(`  Page ${page} error: ${err.message}`);
        }
        await sleep(1500);
    }

    console.log(`  Total unique SKUs indexed: ${skuUrlMap.size}`);
    return skuUrlMap;
}

// Step 2: Parse individual product page
function parseDursoPage(html, sku) {
    const result = {
        sku,
        status: "ok",
        sourceSite: "dursoboutique.com",
        sourceUrl: "",
        title: "",
        name: "",
        color: "",
        giglioCategoryLeaf: "",
        category: "",
        designerCode: { designerSku: sku },
        price: null,
        composition: null,
        descriptionBullets: [],
        images: [],
        imageCount: 0,
        fetchedAt: new Date().toISOString(),
    };

    // Title
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
    if (titleMatch) result.title = titleMatch[1].trim();

    // Product name from h1 or title
    const h1Match = html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    if (h1Match) result.name = h1Match[1].trim();

    // Price
    const priceMatch = html.match(/itemprop="price"\s+content="([0-9.]+)"/);
    if (priceMatch) {
        const eurPrice = parseFloat(priceMatch[1]);
        result.price = { eur: { now: eurPrice } };
    }

    // Old price
    const oldPriceMatch = html.match(/regular-price[^>]*>([^<]*?)€/);
    if (oldPriceMatch) {
        const oldPrice = parseFloat(oldPriceMatch[1].replace(",", ".").replace(/[^\d.]/g, ""));
        if (oldPrice && result.price) {
            result.price.eur.old = oldPrice;
        }
    }

    // Color
    const colorMatch = html.match(/[Cc]olor[:\s]*([^<\n,]+)/);
    if (colorMatch) {
        result.color = colorMatch[1].trim().replace(/\.$/, "");
    }

    // Composition/Material
    const compMatch = html.match(/[Cc]omposition[:\s]*([^<\n]+)/);
    if (!compMatch) {
        const matMatch = html.match(/[Mm]aterial[:\s]*([^<\n]+)/);
        if (matMatch) result.composition = matMatch[1].trim();
    } else {
        result.composition = compMatch[1].trim();
    }

    // Description text
    const descMatch = html.match(/itemprop="description"[^>]*>([\s\S]*?)<\//);
    if (descMatch) {
        const descText = descMatch[1].replace(/<[^>]+>/g, "").trim();
        if (descText) result.descriptionBullets.push(descText);
    }

    // Images - look for product image URLs
    const imgRegex = /https?:\/\/www\.dursoboutique\.com\/store\/[^\s"']+\.(?:jpg|jpeg|png)/gi;
    const seenImgs = new Set();
    let imgMatch;
    while ((imgMatch = imgRegex.exec(html)) !== null) {
        const url = imgMatch[0];
        // Only take product/large images, skip thumbnails and icons
        if ((url.includes("/large/") || url.includes("/home/") || url.includes("/thickbox/")) && !seenImgs.has(url)) {
            seenImgs.add(url);
            result.images.push(url);
        }
    }

    // Also try CDN images
    const cdnRegex = /https?:\/\/[^\s"']*durso[^\s"']*\.(?:jpg|jpeg|png)/gi;
    while ((imgMatch = cdnRegex.exec(html)) !== null) {
        const url = imgMatch[0];
        if (!seenImgs.has(url) && !url.includes("icon") && !url.includes("logo")) {
            seenImgs.add(url);
            result.images.push(url);
        }
    }

    // Try data-image-large-src attribute (PrestaShop pattern)
    const largeImgRegex = /data-image-large-src="([^"]+)"/g;
    while ((imgMatch = largeImgRegex.exec(html)) !== null) {
        const url = imgMatch[1].startsWith("http") ? imgMatch[1] : `https://www.dursoboutique.com${imgMatch[1]}`;
        if (!seenImgs.has(url)) {
            seenImgs.add(url);
            result.images.push(url);
        }
    }

    // Try srcset or data-full-size-image-url
    const fullSizeRegex = /data-full-size-image-url="([^"]+)"/g;
    while ((imgMatch = fullSizeRegex.exec(html)) !== null) {
        const url = imgMatch[1].startsWith("http") ? imgMatch[1] : `https://www.dursoboutique.com${imgMatch[1]}`;
        if (!seenImgs.has(url)) {
            seenImgs.add(url);
            result.images.push(url);
        }
    }

    result.imageCount = result.images.length;

    // Determine category from name/title
    const nameLower = (result.name + " " + result.title).toLowerCase();
    if (nameLower.includes("bag") || nameLower.includes("borsa") || nameLower.includes("handbag") || nameLower.includes("shoulder")) result.category = "bags";
    else if (nameLower.includes("shoe") || nameLower.includes("sneaker") || nameLower.includes("boot") || nameLower.includes("pump") || nameLower.includes("scarpa")) result.category = "shoes";
    else if (nameLower.includes("dress") || nameLower.includes("abito") || nameLower.includes("vestito")) result.category = "dresses";
    else if (nameLower.includes("skirt") || nameLower.includes("gonna")) result.category = "skirts";
    else if (nameLower.includes("pant") || nameLower.includes("jean") || nameLower.includes("trouser") || nameLower.includes("pantalone")) result.category = "pants";
    else if (nameLower.includes("jacket") || nameLower.includes("coat") || nameLower.includes("giacchet") || nameLower.includes("cappotto")) result.category = "outerwear";
    else if (nameLower.includes("sweater") || nameLower.includes("knit") || nameLower.includes("cardigan") || nameLower.includes("magli")) result.category = "knitwear";
    else if (nameLower.includes("top") || nameLower.includes("blouse") || nameLower.includes("shirt") || nameLower.includes("camicia")) result.category = "shirts-blouses";
    else if (nameLower.includes("scarf") || nameLower.includes("glove") || nameLower.includes("belt") || nameLower.includes("jewel") || nameLower.includes("necklace") || nameLower.includes("accessor")) result.category = "accessories";
    else result.category = "accessories";

    return result;
}

async function main() {
    console.log("=== Parse Missing Twinset SKUs from DursoBoutique ===\n");
    console.log(`Missing SKUs to find: ${MISSING_SKUS.length}\n`);

    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    await fs.mkdir(path.join(OUTPUT_DIR, "raw"), { recursive: true });

    // Step 1: Index catalog
    console.log("Step 1: Indexing DursoBoutique catalog...");
    const urlMap = await indexDursoCatalog();

    // Save URL map
    const mapObj = Object.fromEntries(urlMap);
    await fs.writeFile(path.join(OUTPUT_DIR, "durso_url_map.json"), JSON.stringify(mapObj, null, 2) + "\n");

    // Step 2: Match our missing SKUs
    const found = [];
    const notInCatalog = [];

    for (const sku of MISSING_SKUS) {
        if (urlMap.has(sku)) {
            found.push({ sku, url: urlMap.get(sku) });
        } else {
            notInCatalog.push(sku);
        }
    }

    console.log(`\nCatalog match: ${found.length} found, ${notInCatalog.length} not found`);
    if (found.length) console.log(`Found: ${found.map(f => f.sku).join(", ")}`);
    if (notInCatalog.length) console.log(`Not found: ${notInCatalog.join(", ")}`);

    // Step 3: Fetch product pages
    console.log("\nStep 2: Fetching product pages...");
    const parsed = [];
    const errors = [];

    for (let i = 0; i < found.length; i++) {
        const { sku, url } = found[i];
        console.log(`  [${i + 1}/${found.length}] ${sku}: ${url}`);
        try {
            const html = await fetchPage(url);
            await fs.writeFile(path.join(OUTPUT_DIR, "raw", `${sku}.html`), html);

            const product = parseDursoPage(html, sku);
            product.sourceUrl = url;
            parsed.push(product);
            console.log(`    ✓ ${product.name || "?"} | ${product.color || "?"} | ${product.imageCount} imgs | cat: ${product.category}`);
        } catch (err) {
            console.error(`    ✗ ${err.message}`);
            errors.push({ sku, url, error: err.message });
        }
        await sleep(2000);
    }

    // Save results
    await fs.writeFile(
        path.join(OUTPUT_DIR, "parsed.json"),
        JSON.stringify(parsed, null, 2) + "\n"
    );

    const notFound = notInCatalog.map(sku => ({
        sku,
        status: "not_in_durso_catalog",
        reason: "SKU not found in DursoBoutique catalog",
    }));

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

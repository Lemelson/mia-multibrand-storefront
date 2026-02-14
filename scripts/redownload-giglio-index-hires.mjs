#!/usr/bin/env node

/**
 * Re-download images for products imported from the Giglio index run
 * at higher resolution (1200x1600) and regenerate all size variants.
 *
 * Usage: node scripts/redownload-giglio-index-hires.mjs
 */

import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const PARSED_PATH = path.join(ROOT, "outputs/twinset_giglio_index_run/parsed.json");
const PUBLIC_DIR = path.join(ROOT, "public");

const PROFILES = {
    detail: { w: 576, h: 704 },
    card: { w: 316, h: 386 },
    thumb: { w: 245, h: 300 },
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function downloadImage(url, outputPath) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36",
            Accept: "image/jpeg,image/*;q=0.9,*/*;q=0.8",
        },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Empty response");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);
    return buffer.length;
}

function resizeImage(inputPath, outputPath, width, height) {
    execSync(`mkdir -p "${path.dirname(outputPath)}"`);
    execSync(
        `sips --resampleHeightWidth ${height} ${width} "${inputPath}" --out "${outputPath}" 2>/dev/null`,
        { stdio: "pipe" }
    );
}

function toHighResUrl(originalUrl) {
    // Convert from t_prodZoom or t_prodPage → w_1200 for hi-res
    return originalUrl
        .replace(/\/t_prod\w+\//, "/")
        .replace(/\/f_auto\//, "/f_auto,w_1200/");
}

async function main() {
    console.log("=== Re-download Giglio Index Images at High Resolution ===\n");

    const products = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf8"));
    const parsed = JSON.parse(await fs.readFile(PARSED_PATH, "utf8"));

    // Build SKU → images map from parsed data
    const skuImages = new Map();
    for (const item of parsed) {
        if (item.images?.length > 0) {
            skuImages.set(item.sku, item.images);
        }
    }

    // Find products to re-download (p-145 through p-165)
    const targetProducts = products.filter(p => {
        const idNum = parseInt(p.id.replace("p-", ""), 10);
        return idNum >= 145 && idNum <= 165;
    });

    console.log(`Target products: ${targetProducts.length}`);
    let totalDownloaded = 0;
    let totalSkipped = 0;

    for (const product of targetProducts) {
        const originalImages = skuImages.get(product.sku);
        if (!originalImages) {
            console.log(`${product.id} (${product.sku}): no parsed images, skipping`);
            continue;
        }

        console.log(`\n${product.id} (${product.sku}): ${originalImages.length} images`);

        for (let imgIdx = 0; imgIdx < originalImages.length; imgIdx++) {
            const imgUrl = originalImages[imgIdx];
            const highResUrl = toHighResUrl(imgUrl);
            const num = String(imgIdx + 1).padStart(2, "0");
            const slug = product.slug;
            const colorId = product.colors[0].id;
            const baseDir = path.join(PUBLIC_DIR, "media/products", slug, colorId);

            const originalPath = path.join(baseDir, "original", `${num}.jpg`);

            // Check if already high-res
            try {
                const stat = await fs.stat(originalPath);
                if (stat.size > 40000) {
                    console.log(`  ${num}: already hi-res (${(stat.size / 1024).toFixed(0)}KB), skip`);
                    totalSkipped++;
                    continue;
                }
            } catch {
                // File doesn't exist
            }

            try {
                console.log(`  ${num}: downloading hi-res...`);
                const bytes = await downloadImage(highResUrl, originalPath);
                console.log(`  ${num}: ${(bytes / 1024).toFixed(0)}KB`);
                totalDownloaded++;

                // Regenerate all size variants
                for (const [profile, dims] of Object.entries(PROFILES)) {
                    const outPath = path.join(baseDir, profile, `${num}.jpg`);
                    resizeImage(originalPath, outPath, dims.w, dims.h);
                }

                await sleep(300);
            } catch (err) {
                console.error(`  ${num}: FAILED - ${err.message}`);
            }
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`Downloaded: ${totalDownloaded}`);
    console.log(`Skipped (already hi-res): ${totalSkipped}`);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

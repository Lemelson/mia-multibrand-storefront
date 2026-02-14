#!/usr/bin/env node

/**
 * Re-download giglio images at higher resolution (1200x1600)
 * and regenerate detail/card/thumb variants.
 */

import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();

const PROFILES = {
    detail: { w: 576, h: 704 },
    card: { w: 316, h: 386 },
    thumb: { w: 245, h: 300 },
};

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function downloadImage(url, outputPath) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            Accept: "image/jpeg,image/*;q=0.9,*/*;q=0.8",
        },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);
    return buffer.length;
}

async function main() {
    const parsed = JSON.parse(await fs.readFile(
        path.join(ROOT, "outputs/twinset_giglio_jina_missing_full/twinset_giglio_parsed.json"), "utf8"
    ));
    const products = JSON.parse(await fs.readFile(
        path.join(ROOT, "src/data/products.json"), "utf8"
    ));

    const newProds = products.filter(p => parseInt(p.id.split("-")[1], 10) >= 126);
    console.log(`New products to re-download: ${newProds.length}`);

    // Build SKU → giglio images map
    const imgMap = {};
    for (const item of parsed) {
        if (item.status === "ok" && item.images?.length > 0) {
            imgMap[item.sku] = item.images;
        }
    }

    let done = 0;
    let failed = 0;
    let total = 0;

    for (const prod of newProds) {
        const giglioImgs = imgMap[prod.sku];
        if (!giglioImgs) continue;

        const slug = prod.slug;
        const colorId = prod.colors[0].id;

        for (let i = 0; i < giglioImgs.length; i++) {
            total++;
            const origUrl = giglioImgs[i];
            const num = String(i + 1).padStart(2, "0");
            const baseDir = path.join(ROOT, "public/media/products", slug, colorId);

            // Convert: f_auto/t_prodZoom → f_auto,w_1200
            const hiResUrl = origUrl.replace("f_auto/t_prodZoom", "f_auto,w_1200");

            const origPath = path.join(baseDir, "original", `${num}.jpg`);

            try {
                const bytes = await downloadImage(hiResUrl, origPath);

                // Regenerate variants via sips
                for (const [key, profile] of Object.entries(PROFILES)) {
                    const varPath = path.join(baseDir, key, `${num}.jpg`);
                    await fs.mkdir(path.dirname(varPath), { recursive: true });
                    execSync(
                        `sips --resampleHeightWidth ${profile.h} ${profile.w} "${origPath}" --out "${varPath}" 2>/dev/null`,
                        { stdio: "pipe" }
                    );
                }

                done++;
                if (done % 10 === 0 || done === 1) {
                    console.log(`[${done}/${total}] ${prod.sku} img ${num}: ${(bytes / 1024).toFixed(0)}KB → 1200x1600`);
                }
                await sleep(300);
            } catch (err) {
                failed++;
                console.error(`FAILED: ${prod.sku} img ${num}: ${err.message}`);
            }
        }
    }

    console.log(`\nDone. Re-downloaded ${done}/${total} images at 1200x1600.`);
    if (failed) console.log(`Failed: ${failed}`);
}

main().catch(err => { console.error(err); process.exit(1); });

#!/usr/bin/env node

/**
 * Regenerate card/detail/thumb images for ALL Twinset products from originals.
 *
 * Target sizes (matching the app's PROFILE_BY_KIND in src/lib/image.ts):
 *   card:   640 x 782   (catalog grid)
 *   detail: 960 x 1173  (product detail page)
 *   thumb:  160 x 196   (detail page mini thumbnails)
 *
 * Usage: node scripts/regenerate-twinset-images.mjs
 */

import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const PRODUCTS_DIR = path.join(ROOT, "public/media/products");

const PROFILES = {
    card:   { w: 640,  h: 782 },
    detail: { w: 960,  h: 1173 },
    thumb:  { w: 160,  h: 196 },
};

function resizeImage(inputPath, outputPath, width, height) {
    execSync(`mkdir -p "${path.dirname(outputPath)}"`);
    execSync(
        `sips --resampleHeightWidth ${height} ${width} "${inputPath}" --out "${outputPath}" 2>/dev/null`,
        { stdio: "pipe" }
    );
}

async function main() {
    console.log("=== Regenerate Twinset Product Images ===\n");
    console.log("Target sizes:");
    for (const [name, dims] of Object.entries(PROFILES)) {
        console.log(`  ${name}: ${dims.w}x${dims.h}`);
    }
    console.log("");

    // Find all twinset product directories
    const allDirs = await fs.readdir(PRODUCTS_DIR);
    const twinsetDirs = allDirs.filter(d => d.startsWith("twinset-"));

    console.log(`Found ${twinsetDirs.length} Twinset product directories\n`);

    let totalRegenerated = 0;
    let totalSkippedNoOriginal = 0;
    let totalErrors = 0;

    for (const productDir of twinsetDirs) {
        const productPath = path.join(PRODUCTS_DIR, productDir);

        // List color subdirectories
        const colorDirs = await fs.readdir(productPath);

        for (const colorDir of colorDirs) {
            const colorPath = path.join(productPath, colorDir);
            const originalDir = path.join(colorPath, "original");

            // Check if original directory exists
            try {
                await fs.stat(originalDir);
            } catch {
                totalSkippedNoOriginal++;
                continue;
            }

            const origFiles = (await fs.readdir(originalDir)).filter(f =>
                f.endsWith(".jpg") || f.endsWith(".jpeg") || f.endsWith(".png") || f.endsWith(".webp")
            );

            if (origFiles.length === 0) {
                totalSkippedNoOriginal++;
                continue;
            }

            let regeneratedThisColor = 0;

            for (const imgFile of origFiles) {
                const originalPath = path.join(originalDir, imgFile);

                // Get original dimensions
                let origWidth, origHeight;
                try {
                    const sipsOutput = execSync(
                        `sips -g pixelWidth -g pixelHeight "${originalPath}" 2>/dev/null`,
                        { encoding: "utf8" }
                    );
                    origWidth = parseInt(sipsOutput.match(/pixelWidth:\s*(\d+)/)?.[1] || "0");
                    origHeight = parseInt(sipsOutput.match(/pixelHeight:\s*(\d+)/)?.[1] || "0");
                } catch {
                    continue;
                }

                if (origWidth < 100 || origHeight < 100) continue;

                for (const [profile, dims] of Object.entries(PROFILES)) {
                    const outPath = path.join(colorPath, profile, imgFile);

                    try {
                        // Check if existing file is already correct size
                        try {
                            const existing = execSync(
                                `sips -g pixelWidth "${outPath}" 2>/dev/null`,
                                { encoding: "utf8" }
                            );
                            const existingWidth = parseInt(existing.match(/pixelWidth:\s*(\d+)/)?.[1] || "0");
                            if (existingWidth === dims.w) {
                                continue; // Already correct size
                            }
                        } catch {
                            // File doesn't exist, will create
                        }

                        resizeImage(originalPath, outPath, dims.w, dims.h);
                        regeneratedThisColor++;
                        totalRegenerated++;
                    } catch (err) {
                        totalErrors++;
                    }
                }
            }

            if (regeneratedThisColor > 0) {
                console.log(`  ${productDir}/${colorDir}: ${regeneratedThisColor} images regenerated`);
            }
        }
    }

    console.log(`\n=== Done ===`);
    console.log(`Regenerated: ${totalRegenerated} image files`);
    console.log(`Skipped (no original): ${totalSkippedNoOriginal} color variants`);
    console.log(`Errors: ${totalErrors}`);

    // Verify a sample
    console.log(`\n=== Sample verification ===`);
    const sampleDirs = twinsetDirs.slice(0, 3);
    for (const d of sampleDirs) {
        const colorDirs = await fs.readdir(path.join(PRODUCTS_DIR, d));
        for (const c of colorDirs) {
            for (const profile of ["card", "detail", "thumb"]) {
                const testFile = path.join(PRODUCTS_DIR, d, c, profile, "01.jpg");
                try {
                    const out = execSync(`sips -g pixelWidth -g pixelHeight "${testFile}" 2>/dev/null`, { encoding: "utf8" });
                    const w = out.match(/pixelWidth:\s*(\d+)/)?.[1];
                    const h = out.match(/pixelHeight:\s*(\d+)/)?.[1];
                    console.log(`  ${d}/${c}/${profile}/01.jpg: ${w}x${h}`);
                } catch {}
            }
            break;
        }
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

#!/usr/bin/env node

/**
 * Import the 6 Twinset products that have Giglio data but no images.
 * For 252TF3023 — uses twinset.com CDN images.
 * For the other 5 — imports with data only, no images (they'll show as placeholder).
 *
 * Usage: node scripts/import-noimage-products.mjs [--dry-run]
 */

import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const PUBLIC_DIR = path.join(ROOT, "public");

const PROFILES = {
    detail: { w: 576, h: 704 },
    card: { w: 316, h: 386 },
    thumb: { w: 245, h: 300 },
};

const DRY_RUN = process.argv.includes("--dry-run");

// Products to import — manually curated from Giglio index run data
const PRODUCTS_DATA = [
    {
        sku: "252TF3023",
        name: "Sweater woman",
        color: "Grey",
        category: "knitwear",
        giglioCategoryLeaf: "Sweater",
        composition: "TES:29%WO 24%CO 19%PC 14%PA 14%WM",
        price: { eur: { now: 134.26, old: 265.67 } },
        descriptionBullets: ["Style: Basic", "Materials: Wool blend", "Pattern: Plain-colored", "Neck: Turtleneck"],
        // Twinset CDN images (1280x1565)
        images: [
            "https://twinset-cdn.thron.com/delivery/public/image/twinset/632ea752-87de-4a4b-9644-56d176986325/6ujb0j/std/1280x1565/252TF3023_12998_01?quality=auto-high&format=jpg",
            "https://twinset-cdn.thron.com/delivery/public/image/twinset/9d62b687-82aa-4aa4-aa68-e03ac6d781fd/6ujb0j/std/1280x1565/252TF3023_12998_02?quality=auto-high&format=jpg",
            "https://twinset-cdn.thron.com/delivery/public/image/twinset/776585d0-ea3b-4122-9223-493b2cecff23/6ujb0j/std/1280x1565/252TF3023_12998_03?quality=auto-high&format=jpg",
            "https://twinset-cdn.thron.com/delivery/public/image/twinset/997d6d31-97c9-4516-aca9-28e27b1655a3/6ujb0j/std/1280x1565/252TF3023_12998_04?quality=auto-high&format=jpg",
        ],
    },
    {
        sku: "252TO519B",
        name: "Gloves woman",
        color: "Pink",
        category: "accessories",
        giglioCategoryLeaf: "Gloves",
        composition: null,
        price: { eur: { now: 50.94 } },
        descriptionBullets: ["Style: Casual", "Materials: Acrylic, Lurex, Polyester", "Pattern: Bicolor"],
        images: [], // No images available
    },
    {
        sku: "252TP3573",
        name: "Skirt woman",
        color: "Grey",
        category: "skirts",
        giglioCategoryLeaf: "Skirt",
        composition: "TES:85%WO 15%WS",
        price: { eur: { now: 180.68, old: 390 } },
        descriptionBullets: ["Style: Classic", "Materials: Cashmere, Wool", "Pattern: Plain-colored", "Length: Long skirts"],
        images: [], // No images available
    },
    {
        sku: "252TO519A",
        name: "Scarf woman",
        color: "Pink",
        category: "accessories",
        giglioCategoryLeaf: "Scarf",
        composition: null,
        price: { eur: { now: 90.37, old: 143.06 } },
        descriptionBullets: ["Style: Casual", "Materials: Acrylic, Lurex, Polyester", "Pattern: Bicolor"],
        images: [], // No images available
    },
    {
        sku: "252TT2060",
        name: "Jacket woman",
        color: "White",
        category: "outerwear",
        giglioCategoryLeaf: "Jacket",
        composition: "TES:100%PA FO1:100%PA FO2:100%PL IPI:90%P7",
        price: { eur: { now: 337.35, old: 890 } },
        descriptionBullets: ["Style: Sporty", "Materials: Nylon", "Pattern: Plain-colored", "Length: Short jackets"],
        images: [], // No images available
    },
    {
        sku: "252TT3140",
        name: "Suit woman",
        color: "Black",
        category: "dresses",
        giglioCategoryLeaf: "Suit",
        composition: null,
        price: { eur: { now: 118.25 } },
        descriptionBullets: ["Materials: Jersey", "Pattern: Plain-colored", "Length: Mini dresses"],
        images: [], // No images available
    },
];

// Translation maps (same as import-giglio-index-parsed.mjs)
const NAME_MAP = {
    "Skirt": "Юбка", "Sweater": "Свитер", "Dress": "Платье", "Jacket": "Куртка",
    "Suit": "Костюм", "Scarf": "Шарф", "Gloves": "Перчатки", "Top": "Топ",
};
const COLOR_MAP = {
    "Black": "Чёрный", "White": "Белый", "Grey": "Серый", "Pink": "Розовый",
};
const COLOR_HEX_MAP = {
    "Black": "#1A1A1A", "White": "#F5F5F5", "Grey": "#808080", "Pink": "#E8A0BF",
};
const COMP_CODES = {
    "VI": "вискоза", "WO": "шерсть", "PA": "полиамид", "PL": "полиэстер",
    "CO": "хлопок", "EA": "эластан", "WS": "кашемир", "MD": "модал",
    "PC": "полиакрил", "WM": "шерсть мериноса", "AC": "акрил", "PE": "полиэтилен",
    "PU": "полиуретан", "P7": "полиэфир",
};
const MATERIAL_MAP = {
    "Wool blend": "смесовая шерсть", "Cashmere": "кашемир", "Wool": "шерсть",
    "Nylon": "нейлон", "Jersey": "джерси", "Acrylic": "акрил",
    "Lurex": "люрекс", "Polyester": "полиэстер",
};
const STYLE_MAP = {
    "Casual": "повседневный", "Classic": "классический", "Basic": "базовый",
    "Sporty": "спортивный",
};

const sleep = ms => new Promise(r => setTimeout(r, ms));

function translateComposition(raw) {
    if (!raw) return "Состав уточняется.";
    const sections = raw.split(/\s*(?:TES|DTM|FOD|FO1|FO2|MAT|IPI|FTA|CIN):/i).filter(Boolean);
    const parsed = [];
    for (const section of sections) {
        const matches = section.matchAll(/(\d+)%([A-Z0-9]{2})/g);
        const parts = [];
        for (const m of matches) parts.push(`${m[1]}% ${COMP_CODES[m[2]] || m[2]}`);
        if (parts.length) parsed.push(parts.join(", "));
    }
    if (!parsed.length) return raw;
    if (parsed.length === 1) return parsed[0];
    return `${parsed[0]}. Подкладка: ${parsed.slice(1).join("; ")}`;
}

function translateName(item) {
    const leaf = item.giglioCategoryLeaf || "";
    const ru = NAME_MAP[leaf] || leaf;
    const material = (item.descriptionBullets || []).find(b => b.startsWith("Materials:"));
    let parts = [ru];
    if (material) {
        const matVal = material.replace("Materials: ", "").split(",")[0].trim();
        const matRu = MATERIAL_MAP[matVal];
        if (matRu) parts.unshift(matRu.charAt(0).toUpperCase() + matRu.slice(1));
    }
    return `${parts.join(" ")} Twinset`;
}

function translateDescription(item) {
    const leaf = item.giglioCategoryLeaf || "";
    const ru = NAME_MAP[leaf] || leaf;
    let desc = `${ru} от Twinset Milano из коллекции Осень-Зима 2025.`;
    const bullets = item.descriptionBullets || [];
    const style = bullets.find(b => b.startsWith("Style:"));
    if (style) {
        const val = style.replace("Style: ", "").split(",")[0].trim();
        if (STYLE_MAP[val]) desc += ` Стиль: ${STYLE_MAP[val]}.`;
    }
    const material = bullets.find(b => b.startsWith("Materials:"));
    if (material) {
        const matNames = material.replace("Materials: ", "").split(",").map(m => MATERIAL_MAP[m.trim()] || m.trim().toLowerCase());
        desc += ` Материал: ${matNames.join(", ")}.`;
    }
    return desc;
}

function eurToRub(eur) {
    if (!eur) return null;
    return Math.round(eur * 100 / 100) * 100;
}

async function downloadImage(url, outputPath) {
    const response = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length) throw new Error("Empty");
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, buffer);
    return buffer.length;
}

function resizeImage(inputPath, outputPath, width, height) {
    execSync(`mkdir -p "${path.dirname(outputPath)}"`);
    execSync(`sips --resampleHeightWidth ${height} ${width} "${inputPath}" --out "${outputPath}" 2>/dev/null`, { stdio: "pipe" });
}

async function main() {
    console.log("=== Import No-Image Products ===\n");

    const existingProducts = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf8"));
    const existingSkus = new Set(existingProducts.filter(p => p.sku).map(p => p.sku));

    let maxId = 0;
    for (const p of existingProducts) {
        const m = p.id.match(/p-(\d+)/);
        if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }

    const toImport = PRODUCTS_DATA.filter(item => !existingSkus.has(item.sku));
    console.log(`To import: ${toImport.length} products\n`);

    const newProducts = [];
    let nextId = maxId + 1;

    for (const item of toImport) {
        const pid = `p-${String(nextId).padStart(3, "0")}`;
        const slug = `twinset-${item.sku.toLowerCase()}`;
        const colorId = `${pid}-c1`;

        console.log(`${pid}: ${item.sku} (${item.name})`);

        const imagePaths = [];

        if (item.images.length > 0 && !DRY_RUN) {
            for (let i = 0; i < item.images.length; i++) {
                const num = String(i + 1).padStart(2, "0");
                const baseDir = path.join(PUBLIC_DIR, "media/products", slug, colorId);
                const originalPath = path.join(baseDir, "original", `${num}.jpg`);

                try {
                    try { await fs.stat(originalPath); console.log(`  img ${num}: exists`); }
                    catch {
                        console.log(`  img ${num}: downloading...`);
                        const bytes = await downloadImage(item.images[i], originalPath);
                        console.log(`  img ${num}: ${(bytes / 1024).toFixed(0)}KB`);
                        await sleep(500);
                    }

                    for (const [profile, dims] of Object.entries(PROFILES)) {
                        const outPath = path.join(baseDir, profile, `${num}.jpg`);
                        try { await fs.stat(outPath); } catch {
                            resizeImage(originalPath, outPath, dims.w, dims.h);
                        }
                    }
                    imagePaths.push(`/media/products/${slug}/${colorId}/detail/${num}.jpg`);
                } catch (err) {
                    console.error(`  img ${num}: FAILED - ${err.message}`);
                }
            }
        }

        if (imagePaths.length === 0 && item.images.length > 0) {
            console.log(`  ⚠ No images downloaded, adding placeholder paths`);
        }

        const colorRu = COLOR_MAP[item.color] || item.color;
        const name = translateName(item);
        const description = translateDescription(item);
        const composition = translateComposition(item.composition);
        const priceEur = item.price?.eur?.now;
        const price = priceEur ? eurToRub(priceEur) : 15000;
        const oldPriceEur = item.price?.eur?.old;
        const oldPrice = oldPriceEur ? eurToRub(oldPriceEur) : (price ? Math.round(price * 1.6 / 100) * 100 : null);

        const product = {
            id: pid,
            sku: item.sku,
            slug,
            name,
            brand: "Twinset Milano",
            description,
            composition,
            care: "Рекомендуется деликатный уход согласно ярлыку изделия.",
            category: item.category,
            gender: "women",
            price: price || 15000,
            ...(oldPrice && oldPrice > price ? { oldPrice } : {}),
            colors: [{
                id: colorId,
                name: colorRu,
                hex: COLOR_HEX_MAP[item.color] || "#1A1A1A",
                images: imagePaths,
                sizes: item.category === "accessories"
                    ? [{ size: "ONE SIZE", inStock: true }]
                    : [
                        { size: "XS", inStock: true }, { size: "S", inStock: true },
                        { size: "M", inStock: true }, { size: "L", inStock: true },
                        { size: "XL", inStock: true },
                    ],
            }],
            stores: [
                { storeId: "mantera-sirius", available: true },
                { storeId: "twinset-krasnaya-polyana", available: true },
            ],
            isNew: true,
            isActive: imagePaths.length > 0, // Only activate products with images
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        newProducts.push(product);
        nextId++;
        console.log(`  ✓ ${name} | ${colorRu} | ${imagePaths.length} imgs | ${price} ₽ | active: ${product.isActive}\n`);
    }

    if (DRY_RUN) {
        console.log("[DRY RUN] Would add", newProducts.length, "products");
    } else {
        const allProducts = [...existingProducts, ...newProducts];
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(allProducts, null, 2) + "\n", "utf8");
        console.log(`✓ Written ${allProducts.length} products to ${PRODUCTS_PATH}`);
    }
}

main().catch(err => { console.error(err); process.exit(1); });

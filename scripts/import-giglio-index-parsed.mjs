#!/usr/bin/env node

/**
 * Import Twinset products parsed from giglio.com (index run) into products.json.
 *
 * Reads from: outputs/twinset_giglio_index_run/parsed.json
 * Only imports items with images that are not already in products.json.
 *
 * Usage: node scripts/import-giglio-index-parsed.mjs [--dry-run] [--skip-images]
 */

import { promises as fs } from "fs";
import path from "path";
import { execSync } from "child_process";

const ROOT = process.cwd();
const PRODUCTS_PATH = path.join(ROOT, "src/data/products.json");
const PARSED_PATH = path.join(ROOT, "outputs/twinset_giglio_index_run/parsed.json");
const PUBLIC_DIR = path.join(ROOT, "public");

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const SKIP_IMAGES = args.has("--skip-images");

const PROFILES = {
    detail: { w: 576, h: 704 },
    card: { w: 316, h: 386 },
    thumb: { w: 245, h: 300 },
};

// ─── Translation maps ───

const NAME_MAP = {
    "Skirt": "Юбка",
    "Sweater": "Свитер",
    "Sweatshirt": "Свитшот",
    "Dress": "Платье",
    "Waistcoat": "Жилет",
    "Top": "Топ",
    "Handbag": "Сумка",
    "Scarf": "Шарф",
    "Jacket": "Куртка",
    "Suit": "Костюм",
    "Jeans": "Джинсы",
    "Jewel": "Украшение",
    "Fur coat": "Шуба",
    "Pants": "Брюки",
    "Coat": "Пальто",
    "Blouse": "Блуза",
    "Shirt": "Рубашка",
    "Cardigan": "Кардиган",
    "Jumpsuit": "Комбинезон",
    "Shorts": "Шорты",
    "Belt": "Ремень",
    "Hat": "Шляпа",
    "Gloves": "Перчатки",
    "Sneakers": "Кроссовки",
    "Pumps": "Туфли",
    "Flat ankle boots": "Ботинки",
    "Boots": "Сапоги",
    "Sandals": "Сандалии",
    "Loafers": "Лоферы",
    "Shoulder bag": "Сумка",
    "Mini bag": "Мини-сумка",
    "Backpack": "Рюкзак",
    "Trench coat": "Тренч",
    "Bag": "Сумка",
};

const COLOR_MAP = {
    "Black": "Чёрный",
    "White": "Белый",
    "Grey": "Серый",
    "Brown": "Коричневый",
    "Multicolor": "Мультиколор",
    "Pink": "Розовый",
    "Denim": "Деним",
    "Gold": "Золотой",
    "Dove Grey": "Голубино-серый",
    "Blue": "Синий",
    "Red": "Красный",
    "Green": "Зелёный",
    "Beige": "Бежевый",
    "Ivory": "Слоновая кость",
    "Charcoal": "Антрацит",
    "Leather": "Кожаный",
    "Silver": "Серебряный",
    "Navy": "Тёмно-синий",
    "Cream": "Кремовый",
    "Camel": "Кэмел",
};

const COLOR_HEX_MAP = {
    "Black": "#1A1A1A",
    "White": "#F5F5F5",
    "Grey": "#808080",
    "Brown": "#7A5A44",
    "Multicolor": "#D4AF37",
    "Pink": "#E8A0BF",
    "Denim": "#5B7FAD",
    "Gold": "#D4AF37",
    "Dove Grey": "#B0B0B0",
    "Blue": "#4169E1",
    "Red": "#CC3333",
    "Green": "#2E8B57",
    "Beige": "#C8B896",
    "Ivory": "#FFFFF0",
    "Charcoal": "#4A4A4A",
    "Leather": "#8B6914",
    "Silver": "#C0C0C0",
    "Navy": "#1B3A5C",
    "Cream": "#FFFDD0",
    "Camel": "#C19A6B",
};

const COMP_CODES = {
    "VI": "вискоза", "WO": "шерсть", "PA": "полиамид", "PL": "полиэстер",
    "CO": "хлопок", "EA": "эластан", "WS": "кашемир", "MD": "модал",
    "PC": "полиакрил", "WM": "шерсть мериноса", "AC": "акрил", "PE": "полиэтилен",
    "PU": "полиуретан", "OT": "другое", "ZN": "цинк", "VE": "стекло",
    "P7": "полиэфир", "SE": "шёлк", "LI": "лён",
};

const CATEGORY_MAP = {
    "skirts": "skirts",
    "knitwear": "knitwear",
    "dresses": "dresses",
    "outerwear": "outerwear",
    "shirts-blouses": "shirts-blouses",
    "bags": "bags",
    "accessories": "accessories",
    "pants": "pants",
    "shoes": "shoes",
};

const LEAF_CATEGORY_OVERRIDE = {
    "Suit separate": "dresses",
    "Crossbody bag": "bags",
    "Sneakers": "shoes",
    "Pumps": "shoes",
    "Flat ankle boots": "shoes",
    "Boots": "shoes",
    "Sandals": "shoes",
    "Loafers": "shoes",
    "Shoulder bag": "bags",
    "Mini bag": "bags",
    "Backpack": "bags",
    "Trench coat": "outerwear",
};

const STYLE_MAP = {
    "Casual": "повседневный", "Classic": "классический", "Basic": "базовый",
    "Minimal": "минималистичный", "Sporty": "спортивный", "Contemporary": "современный",
    "Elegant": "элегантный", "Romantic": "романтичный",
};

const MATERIAL_MAP = {
    "Wool blend": "смесовая шерсть", "Viscose blend": "смесовая вискоза",
    "Viscose": "вискоза", "Cashmere": "кашемир", "Wool": "шерсть",
    "Cotton denim": "хлопковый деним", "Technical fabric": "техническая ткань",
    "Nylon": "нейлон", "Synthetic fur": "искусственный мех",
    "Jersey": "джерси", "Modal": "модал", "Polyester": "полиэстер",
    "Merino wool": "шерсть мериноса", "Synthetic pearls": "искусственный жемчуг",
    "Leather": "кожа", "Synthetic leather": "экокожа", "Suede": "замша",
    "Cotton": "хлопок", "Silk": "шёлк", "Linen": "лён",
    "Acrylic": "акрил", "Lurex": "люрекс",
};

// ─── Helpers ───

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

function translateName(item) {
    // Prefer the full name (e.g., "Shoulder bag") over the leaf (e.g., "Bag")
    const fullType = item.name?.replace(/ woman$/i, "").replace(/ Twinset$/i, "").trim() || "";
    const leaf = item.giglioCategoryLeaf || "";
    // Try full type first, then leaf
    const ru = NAME_MAP[fullType] || NAME_MAP[leaf] || NAME_MAP[fullType.split(" ").pop()] || leaf || fullType;

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
    const bullets = item.descriptionBullets || [];
    const fullType = item.name?.replace(/ woman$/i, "").replace(/ Twinset$/i, "").trim() || "";
    const leaf = item.giglioCategoryLeaf || "";
    const ru = NAME_MAP[fullType] || NAME_MAP[leaf] || NAME_MAP[fullType.split(" ").pop()] || leaf || fullType;

    let desc = `${ru} от Twinset Milano из коллекции Осень-Зима 2025.`;

    const style = bullets.find(b => b.startsWith("Style:"));
    if (style) {
        const val = style.replace("Style: ", "").split(",")[0].trim();
        const styleRu = STYLE_MAP[val];
        if (styleRu) desc += ` Стиль: ${styleRu}.`;
    }

    const material = bullets.find(b => b.startsWith("Materials:"));
    if (material) {
        const matNames = material.replace("Materials: ", "").split(",").map(m => {
            const t = m.trim();
            return MATERIAL_MAP[t] || t.toLowerCase();
        });
        desc += ` Материал: ${matNames.join(", ")}.`;
    }

    const length = bullets.find(b => b.startsWith("Length:"));
    if (length) {
        const lenVal = length.replace("Length: ", "");
        const lenMap = {
            "Long skirts": "Длинная модель", "Midi skirts": "Длина миди",
            "Mini dresses": "Мини-длина", "Midi dresses": "Длина миди",
            "Long sleeve dresses": "Длинный рукав", "Short jackets": "Укороченная модель",
            "Long": "Удлинённая модель", "Short": "Укороченная модель",
        };
        const lenRu = lenMap[lenVal];
        if (lenRu) desc += ` ${lenRu}.`;
    }

    const neckline = bullets.find(b => b.startsWith("Neckline:") || b.startsWith("Neck:"));
    if (neckline) {
        const neckMap = {
            "Crewneck": "Круглый вырез", "V neckline": "V-образный вырез",
            "Turtleneck": "Водолазка", "High": "Высокий ворот", "Lapel": "Лацканы",
        };
        const nVal = neckline.split(": ")[1]?.trim();
        const nRu = neckMap[nVal];
        if (nRu) desc += ` ${nRu}.`;
    }

    return desc;
}

function translateComposition(raw) {
    if (!raw) return "Состав уточняется.";

    // Handle "94%polyester, 6%elastane" format
    if (raw.includes("polyester") || raw.includes("cotton") || raw.includes("elastane") || raw.includes("leather")) {
        const wordMap = {
            "polyester": "полиэстер", "cotton": "хлопок", "elastane": "эластан",
            "viscose": "вискоза", "nylon": "нейлон", "wool": "шерсть",
            "silk": "шёлк", "linen": "лён", "acrylic": "акрил",
            "leather": "кожа", "polyurethane": "полиуретан",
        };
        let result = raw;
        for (const [en, ru] of Object.entries(wordMap)) {
            result = result.replace(new RegExp(en, "gi"), ru);
        }
        return result;
    }

    // Handle "TES:72%VI 28%PL" format
    const sections = raw.split(/\s*(?:TES|DTM|FOD|FO1|FO2|MAT|IPI|FTA|CIN|MA\d):/i).filter(Boolean);

    const parsed = [];
    for (const section of sections) {
        const matches = section.matchAll(/(\d+)%([A-Z0-9]{2})/g);
        const parts = [];
        for (const m of matches) {
            const pct = m[1];
            const code = m[2];
            const name = COMP_CODES[code] || code;
            parts.push(`${pct}% ${name}`);
        }
        if (parts.length) parsed.push(parts.join(", "));
    }

    if (!parsed.length) return raw;

    if (parsed.length === 1) return parsed[0];
    return `${parsed[0]}. Подкладка: ${parsed.slice(1).join("; ")}`;
}

function eurToRub(eurPrice) {
    if (!eurPrice) return null;
    const rate = 100;
    return Math.round(eurPrice * rate / 100) * 100;
}

async function downloadImage(url, outputPath) {
    const response = await fetch(url, {
        headers: {
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/123.0.0.0 Safari/537.36",
            Accept: "image/jpeg,image/*;q=0.9,*/*;q=0.8",
        },
    });

    if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
    }

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

function resolveCategory(item) {
    const leaf = item.giglioCategoryLeaf || item.name?.split(" woman")[0] || "";
    if (LEAF_CATEGORY_OVERRIDE[leaf]) return LEAF_CATEGORY_OVERRIDE[leaf];
    if (item.category && CATEGORY_MAP[item.category]) return CATEGORY_MAP[item.category];

    // Guess from name
    const n = (item.name || "").toLowerCase();
    if (n.includes("sneaker") || n.includes("boot") || n.includes("pump") || n.includes("shoe") || n.includes("loafer") || n.includes("sandal")) return "shoes";
    if (n.includes("bag") || n.includes("backpack")) return "bags";
    if (n.includes("scarf") || n.includes("glove") || n.includes("belt") || n.includes("hat") || n.includes("jewel")) return "accessories";
    return item.category || "accessories";
}

function sizesForCategory(category) {
    if (category === "shoes") {
        return [
            { size: "36", inStock: true },
            { size: "37", inStock: true },
            { size: "38", inStock: true },
            { size: "39", inStock: true },
            { size: "40", inStock: true },
            { size: "41", inStock: true },
        ];
    }
    if (category === "bags" || category === "accessories") {
        return [{ size: "ONE SIZE", inStock: true }];
    }
    return [
        { size: "XS", inStock: true },
        { size: "S", inStock: true },
        { size: "M", inStock: true },
        { size: "L", inStock: true },
        { size: "XL", inStock: true },
    ];
}

// ─── Main ───

async function main() {
    console.log("=== Import Giglio Index Run Products ===\n");

    const existingProducts = JSON.parse(await fs.readFile(PRODUCTS_PATH, "utf8"));
    const existingSkus = new Set(existingProducts.filter(p => p.sku).map(p => p.sku));

    let maxId = 0;
    for (const p of existingProducts) {
        const m = p.id.match(/p-(\d+)/);
        if (m) maxId = Math.max(maxId, parseInt(m[1], 10));
    }
    console.log(`Existing products: ${existingProducts.length}, max ID: p-${maxId}`);

    const parsed = JSON.parse(await fs.readFile(PARSED_PATH, "utf8"));
    console.log(`Giglio index parsed: ${parsed.length} total`);

    // Filter: only items with images AND not already imported
    const toImport = parsed.filter(item =>
        item.imageCount > 0 &&
        !existingSkus.has(item.sku)
    );

    console.log(`To import: ${toImport.length} (with images, not already in DB)\n`);

    if (!toImport.length) {
        console.log("Nothing to import.");
        return;
    }

    const newProducts = [];
    let nextId = maxId + 1;

    for (let i = 0; i < toImport.length; i++) {
        const item = toImport[i];
        const pid = `p-${String(nextId).padStart(3, "0")}`;
        const slug = `twinset-${item.sku.toLowerCase()}`;
        const colorId = `${pid}-c1`;
        const category = resolveCategory(item);

        console.log(`[${i + 1}/${toImport.length}] ${item.sku} → ${pid} (${category})`);

        // Download and resize images
        const imagePaths = [];

        if (!SKIP_IMAGES) {
            for (let imgIdx = 0; imgIdx < item.images.length; imgIdx++) {
                const imgUrl = item.images[imgIdx];
                const num = String(imgIdx + 1).padStart(2, "0");
                const baseDir = path.join(PUBLIC_DIR, "media/products", slug, colorId);

                const originalPath = path.join(baseDir, "original", `${num}.jpg`);
                const detailPath = path.join(baseDir, "detail", `${num}.jpg`);
                const cardPath = path.join(baseDir, "card", `${num}.jpg`);
                const thumbPath = path.join(baseDir, "thumb", `${num}.jpg`);

                try {
                    try {
                        await fs.stat(originalPath);
                        console.log(`  img ${num}: already exists`);
                    } catch {
                        const highResUrl = imgUrl.replace("t_prodZoom", "t_prodPage");
                        console.log(`  img ${num}: downloading...`);
                        const bytes = await downloadImage(highResUrl, originalPath);
                        console.log(`  img ${num}: ${(bytes / 1024).toFixed(0)}KB`);
                        await sleep(500);
                    }

                    // Generate variants
                    try { await fs.stat(detailPath); } catch {
                        resizeImage(originalPath, detailPath, PROFILES.detail.w, PROFILES.detail.h);
                    }
                    try { await fs.stat(cardPath); } catch {
                        resizeImage(originalPath, cardPath, PROFILES.card.w, PROFILES.card.h);
                    }
                    try { await fs.stat(thumbPath); } catch {
                        resizeImage(originalPath, thumbPath, PROFILES.thumb.w, PROFILES.thumb.h);
                    }

                    imagePaths.push(`/media/products/${slug}/${colorId}/detail/${num}.jpg`);
                } catch (err) {
                    console.error(`  img ${num}: FAILED - ${err.message}`);
                }
            }
        }

        if (imagePaths.length === 0 && !SKIP_IMAGES) {
            console.log(`  ⚠ No images downloaded, skipping product`);
            continue;
        }

        const colorRu = COLOR_MAP[item.color] || item.color;
        const name = translateName(item);
        const description = translateDescription(item);
        const composition = translateComposition(item.composition);

        const priceEur = item.price?.eur?.now || item.price?.usd?.now;
        const price = priceEur ? eurToRub(priceEur) : null;
        const oldPriceEur = item.price?.eur?.old || item.price?.usd?.old;
        const oldPrice = oldPriceEur ? eurToRub(oldPriceEur) : (price ? Math.round(price * 1.6 / 100) * 100 : null);

        const product = {
            id: pid,
            sku: item.sku,
            slug,
            name,
            brand: item.name?.includes("Actitude") ? "Twinset Actitude" : "Twinset Milano",
            description,
            composition,
            care: "Рекомендуется деликатный уход согласно ярлыку изделия.",
            category,
            gender: "women",
            price: price || 15000,
            ...(oldPrice && oldPrice > (price || 15000) ? { oldPrice } : {}),
            colors: [
                {
                    id: colorId,
                    name: colorRu,
                    hex: COLOR_HEX_MAP[item.color] || "#1A1A1A",
                    images: SKIP_IMAGES
                        ? item.images.map((_, idx) => `/media/products/${slug}/${colorId}/detail/${String(idx + 1).padStart(2, "0")}.jpg`)
                        : imagePaths,
                    sizes: sizesForCategory(category),
                },
            ],
            stores: [
                { storeId: "mantera-sirius", available: true },
                { storeId: "twinset-krasnaya-polyana", available: true },
            ],
            isNew: true,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        };

        newProducts.push(product);
        nextId++;

        console.log(`  ✓ ${name} | ${colorRu} | ${imagePaths.length} imgs | ${price || "?"} ₽\n`);
    }

    console.log(`\n=== Summary ===`);
    console.log(`New products: ${newProducts.length}`);
    console.log(`ID range: p-${maxId + 1} — p-${maxId + newProducts.length}`);

    if (DRY_RUN) {
        console.log("\n[DRY RUN] Not writing to products.json");
        const outPath = path.join(ROOT, "outputs", "giglio_index_import_preview.json");
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, JSON.stringify(newProducts, null, 2) + "\n", "utf8");
        console.log(`Preview: ${outPath}`);
    } else {
        const allProducts = [...existingProducts, ...newProducts];
        await fs.writeFile(PRODUCTS_PATH, JSON.stringify(allProducts, null, 2) + "\n", "utf8");
        console.log(`✓ Written ${allProducts.length} products to ${PRODUCTS_PATH}`);
    }
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});

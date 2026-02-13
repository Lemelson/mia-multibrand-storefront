#!/usr/bin/env node
/**
 * Normalize existing Max Mara cards in src/data/products.json:
 * - product.name: make short, brand-less, more Twinset-like (derived from description + type)
 * - colors[].name: prefer site-derived colors from outputs/maxmara/article_cards_full.combined.json, normalize casing/spacing
 * - composition/care: prefer site-derived, else normalize existing (percent formatting, whitespace)
 * - category: re-guess from updated name/description (fix obvious wrongs like skirts -> accessories)
 *
 * Usage:
 *   node scripts/normalize-maxmara-products.mjs --dry-run
 *   node scripts/normalize-maxmara-products.mjs
 */

import { promises as fs } from "fs";
import path from "path";

const ROOT = process.cwd();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");

function getArg(name, fallback = undefined) {
  const idx = args.indexOf(name);
  if (idx < 0) return fallback;
  return args[idx + 1] ?? fallback;
}

const productsJsonPath = path.resolve(ROOT, getArg("--products-json", "src/data/products.json"));
const combinedCardsPath = path.resolve(
  ROOT,
  getArg("--cards-json", "outputs/maxmara/article_cards_full.combined.json")
);

function normalizeSpace(v) {
  return String(v || "").replace(/\s+/g, " ").trim();
}

function isMaxMaraProduct(p) {
  const slug = normalizeSpace(p?.slug || "").toLowerCase();
  const brand = normalizeSpace(p?.brand || "").toLowerCase();
  return slug.startsWith("maxmara-") || brand.startsWith("max mara");
}

function stripBrandFromName(name) {
  let s = normalizeSpace(name);
  if (!s) return s;
  // Remove redundant brand tokens in RU/EN
  s = s
    .replace(/\bmax\s*mara\b/gi, "")
    .replace(/\bmaxmara\b/gi, "")
    .replace(/\bweekend\b/gi, "")
    .replace(/\s*\(\s*\d+\s*\)\s*$/g, "") // trailing (19024)
    .replace(/\s*цвет\s+[^()]+$/i, "") // trailing "цвет ..."
    .replace(/\s+/g, " ")
    .trim();
  // Trim leftover punctuation around removed tokens (ASCII + common RU quotes).
  // Do NOT use \\W: it would strip Cyrillic letters.
  s = s.replace(/^[\s.,:;!?()\[\]"'«»]+|[\s.,:;!?()\[\]"'«»]+$/g, "").trim();
  return s;
}

function titleCaseOneToken(t) {
  const s = normalizeSpace(t);
  if (!s) return s;
  const first = s[0];
  return first.toUpperCase() + s.slice(1);
}

function normalizeColorName(value) {
  const raw = normalizeSpace(value);
  if (!raw) return raw;
  const parts = raw
    .split(",")
    .map((p) => normalizeSpace(p))
    .filter(Boolean)
    .map((p) => {
      // Keep ALLCAPS codes as-is; otherwise TitleCase first letter.
      if (/^[A-Z0-9 _-]+$/.test(p) && /[A-Z]/.test(p)) return p;
      return titleCaseOneToken(p.toLowerCase());
    });
  return parts.join(", ");
}

function normalizePercents(text) {
  // "07% эластан" -> "7% эластан"
  return String(text || "").replace(/\b0+(\d+)\s*%/g, "$1%");
}

function normalizeCompositionText(value) {
  let s = normalizeSpace(value);
  if (!s) return s;

  s = normalizePercents(s);

  // Translate/clean common English fiber names and labels that leak in.
  s = s
    .replace(/\bmodal\b/gi, "модал")
    .replace(/\bcotton\b/gi, "хлопок")
    .replace(/\bwool\b/gi, "шерсть")
    .replace(/\bsilk\b/gi, "шелк")
    .replace(/\bviscose\b/gi, "вискоза")
    .replace(/\bpolyester\b/gi, "полиэстер")
    .replace(/\bpolyamide\b/gi, "полиамид")
    .replace(/\belastane\b/gi, "эластан")
    .replace(/\bacetate\b/gi, "ацетат")
    .replace(/\bvirgin\s+wool\b/gi, "шерсть virgin");

  // Remove bare "fabric"/"lining" tokens (with or without colon).
  s = s
    .replace(/(^|\bсостав:\s*)fabric\b[:\s]*/i, "$1")
    .replace(/(^|\bсостав:\s*)lining\b[:\s]*/i, "$1")
    .replace(/\bfabric\b[:\s]*/gi, "")
    .replace(/\blining\b[:\s]*/gi, "");

  s = s.replace(/\s*,\s*/g, ", ").replace(/\s*:\s*/g, ": ").replace(/\s+/g, " ").trim();
  return s;
}

function buildCompositionFromSiteOrExisting({ sitePage, existingComposition, description }) {
  const siteLine = normalizeSpace(sitePage?.composition_line || "");
  if (siteLine) return normalizeCompositionText(siteLine);

  const existing = normalizeSpace(existingComposition);
  if (existing) return normalizeCompositionText(existing);

  // Some descriptions embed "Состав: ..."
  const d = normalizeSpace(description);
  const m = /(?:^|\s)Состав:\s*([^.\n]+)(?:[.\n]|$)/i.exec(d);
  if (m) return normalizeCompositionText(`Состав: ${normalizeSpace(m[1])}`);

  return "Состав: см. ярлык изделия.";
}

function buildCareFromSiteOrExisting({ sitePage, existingCare }) {
  const siteCare = normalizeSpace(sitePage?.care_line || "");
  if (siteCare) return siteCare;
  const existing = normalizeSpace(existingCare);
  if (existing) return existing;
  return "Рекомендуется деликатный уход согласно ярлыку изделия.";
}

function pickTypeFromText(text) {
  const hay = normalizeSpace(text).toLowerCase();
  if (!hay) return "";

  const rules = [
    [/джинсы|jeans/, "Джинсы"],
    [/юбк|skirt/, "Юбка"],
    [/брюк|trouser|pants/, "Брюки"],
    [/плать|dress/, "Платье"],
    [/шорт|shorts/, "Шорты"],
    [/блуз|рубаш|shirt|blouse/, "Блузка"],
    [/футбол|t-?shirt/, "Футболка"],
    [/джемпер|свитер|кардиган|трикотаж|sweater|cardigan|knit/, "Джемпер"],
    [/худи|толстовк|hoodie|sweatshirt/, "Толстовка"],
    [/жакет|пиджак|blazer|jacket/, "Жакет"],
    [/пальто|тренч|плащ|coat|trench/, "Пальто"],
    [/куртк|бомбер|ветровк|puffer/, "Куртка"],
    [/кроссов|сникер|sneaker/, "Кроссовки"],
    [/ботин|сапог|boot/, "Ботинки"],
    [/туфл|loafer|moc|pump/, "Туфли"],
    [/босонож|сандал|sandal/, "Босоножки"],
    [/ремень|belt/, "Ремень"],
    [/сумк|bag/, "Сумка"],
    [/ожерель|necklace/, "Ожерелье"],
    [/браслет|bracelet/, "Браслет"],
    [/серьг|earring/, "Серьги"],
    [/кольц|ring/, "Кольцо"]
  ];

  for (const [re, label] of rules) {
    if (re.test(hay)) return label;
  }
  return "";
}

function extractQualifiers(text) {
  const hay = normalizeSpace(text).toLowerCase();
  if (!hay) return [];

  const out = [];
  const add = (q) => {
    if (!q) return;
    if (out.includes(q)) return;
    out.push(q);
  };

  // Style/material qualifiers
  // Use noun phrases to avoid adjective agreement issues.
  if (/(джинсов|деним|jean)/.test(hay)) add("из денима");
  if (/(трикотаж|knit)/.test(hay)) add("из трикотажа");
  if (/(плисс|pleat)/.test(hay)) add("плиссе");
  if (/(в горошек|горошк|polka)/.test(hay)) add("в горошек");
  if (/(принт|print)/.test(hay)) add("с принтом");
  if (/(оверсайз|oversize)/.test(hay)) add("оверсайз");

  // Length/silhouette
  // Avoid false positives like "минимализм".
  if (/(^|[\s\-–—])мини($|[\s\-–—])/.test(hay) || /miniskirt/.test(hay)) add("мини");
  if (/(^|[\s\-–—])миди($|[\s\-–—])/.test(hay)) add("миди");
  if (/(^|[\s\-–—])макси($|[\s\-–—])/.test(hay)) add("макси");

  // Pants specific
  if (/(^|[\s\-–—])палаццо($|[\s\-–—])/.test(hay) || /palazzo/.test(hay)) add("палаццо");

  return out;
}

function primaryFiberFromComposition(comp) {
  const s = normalizeSpace(comp).toLowerCase();
  if (!s) return "";
  if (s.includes("металл") && s.includes("стекл")) return "металла и стекла";
  const map = [
    ["кашемир", "кашемира"],
    ["шерсть virgin", "шерсти virgin"],
    ["шерсть", "шерсти"],
    ["шелк", "шелка"],
    ["хлопок", "хлопка"],
    ["ацетат", "ацетата"],
    ["вискоза", "вискозы"],
    ["лен", "льна"],
    ["кожа", "кожи"],
    ["металл", "металла"],
    ["стекло", "стекла"],
    ["полиэстер", "полиэстера"],
    ["полиамид", "полиамида"],
    ["эластан", "эластана"]
  ];
  for (const [needle, genitive] of map) {
    if (s.includes(needle)) return genitive;
  }
  return "";
}

function buildShortName({ type, description, composition }) {
  const desc = normalizeSpace(description);
  const qualifiers = extractQualifiers(desc);

  // Special casing: "Брюки" + "палаццо" => "Брюки-палаццо"
  let outType = type;
  if (outType === "Брюки" && qualifiers.includes("палаццо")) {
    outType = "Брюки-палаццо";
  }

  // Denim skirts: make the title user-friendly.
  if (outType === "Юбка" && qualifiers.includes("из денима")) {
    if (qualifiers.includes("мини")) return "Джинсовая мини-юбка";
    if (qualifiers.includes("миди")) return "Джинсовая юбка-миди";
    if (qualifiers.includes("макси")) return "Джинсовая юбка-макси";
    return "Джинсовая юбка";
  }

  const fiber = primaryFiberFromComposition(composition);
  const parts = [];
  parts.push(outType || "Изделие");

  // Put most informative qualifiers first, cap at 2 (Twinset-like brevity).
  const filtered = qualifiers.filter((q) => q !== "палаццо");
  for (const q of filtered.slice(0, 2)) parts.push(q);

  // Add "из ..." only for apparel/accessories (avoid over-long names).
  const alreadyHasIz = parts.some((p) => /^из\s+/i.test(p));
  if (fiber && parts.length < 4 && !alreadyHasIz) parts.push(`из ${fiber}`);

  return titleCaseOneToken(parts.join(" "));
}

function guessCategoryFromText(text) {
  const hay = normalizeSpace(text).toLowerCase();
  if (!hay) return "accessories";
  if (/(джинс|jean)/.test(hay)) return "jeans";
  if (/(шорт|shorts|брюк|брюки|палаццо|джоггер|легинс|штаны|trouser|pants)/.test(hay)) return "pants";
  if (/(юбк|skirt)/.test(hay)) return "skirts";
  if (/(плать|сарафан|dress)/.test(hay)) return "dresses";
  if (/(пальто|пуховик|куртк|тренч|плащ|жилет|бомбер|ветровк|жакет|пиджак|coat|jacket|blazer)/.test(hay))
    return "outerwear";
  if (/(толстовк|джемпер|свитер|водолаз|кардиган|трикотаж|свитшот|худи|sweater|cardigan|knit)/.test(hay))
    return "knitwear";
  if (/(рубаш|блуз|топ|футбол|shirt|blouse|top|t-?shirt)/.test(hay)) return "shirts-blouses";
  if (/(ботин|сапог|туфл|кроссов|кед|лофер|босонож|сандал|shoe|sneaker|boot)/.test(hay)) return "shoes";
  if (/(сумк|ремень|шарф|палантин|кошел|очк|украшен|браслет|серьг|кольц|ожерель|bag|scarf|jewelry)/.test(hay))
    return "accessories";
  return "accessories";
}

async function main() {
  const products = JSON.parse(await fs.readFile(productsJsonPath, "utf-8"));

  let combined = [];
  try {
    combined = JSON.parse(await fs.readFile(combinedCardsPath, "utf-8"));
  } catch {
    combined = [];
  }

  const combinedByStyle = new Map();
  for (const row of combined) {
    const style = normalizeSpace(row?.style || "");
    if (style) combinedByStyle.set(style.toUpperCase(), row);
  }

  let changed = 0;
  const changes = [];

  for (const p of products) {
    if (!isMaxMaraProduct(p)) continue;
    const sku = normalizeSpace(p?.sku || "").toUpperCase();
    if (!sku) continue;

    const row = combinedByStyle.get(sku);
    const pages = (row?.site_data?.pages || []).filter(Boolean);
    const sitePage =
      pages.find((x) => normalizeSpace(x.source) === "online-fashion.ru") || pages[0] || null;

    const next = { ...p };
    const beforeName = p?.name;
    const beforeColorNames = Array.isArray(p?.colors) ? p.colors.map((c) => c?.name) : null;
    const beforeComposition = p?.composition;
    const beforeCare = p?.care;
    const beforeCategory = p?.category;

    // Composition/Care
    next.composition = buildCompositionFromSiteOrExisting({
      sitePage,
      existingComposition: p.composition,
      description: p.description
    });
    next.care = buildCareFromSiteOrExisting({ sitePage, existingCare: p.care });

    // Colors
    const siteColors = Array.isArray(sitePage?.colors) ? sitePage.colors : [];
    if (Array.isArray(next.colors) && next.colors.length) {
      if (next.colors.length === 1) {
        const desired = normalizeColorName(siteColors.join(", "));
        if (desired) next.colors[0] = { ...next.colors[0], name: desired };
        next.colors = next.colors.map((c) => ({ ...c, name: normalizeColorName(c?.name || "") || c.name }));
      } else {
        // Multi-variant products: map color names per corresponding site page index.
        const preferredPages = pages.some((p) => normalizeSpace(p?.source) === "online-fashion.ru")
          ? pages.filter((p) => normalizeSpace(p?.source) === "online-fashion.ru")
          : pages;

        next.colors = next.colors.map((c, idx) => {
          const page = preferredPages[idx];
          const pageColor = Array.isArray(page?.colors) ? normalizeColorName(page.colors.join(", ")) : "";
          const fallback = normalizeColorName(c?.name || "") || c?.name || "Цвет";
          return { ...c, name: pageColor || fallback };
        });
      }
    }

    // Name: derive from description/type (no brand, short)
    const type = pickTypeFromText(
      `${sitePage?.product_name_line || ""} ${sitePage?.og_title || ""} ${sitePage?.title || ""} ${p.name} ${p.description}`
    );
    const shortName = buildShortName({ type, description: p.description, composition: next.composition });
    next.name = shortName ? shortName : stripBrandFromName(p.name);

    // Ensure we didn't keep brand in name.
    next.name = stripBrandFromName(next.name);

    // Category: re-guess from better signals (fix common wrongs)
    next.category = guessCategoryFromText(
      `${sitePage?.product_name_line || ""} ${sitePage?.og_title || ""} ${sitePage?.title || ""} ${next.name} ${p.description}`
    );

    // Track diffs
    const before = JSON.stringify(p);
    const after = JSON.stringify(next);
    if (before !== after) {
      Object.assign(p, next);
      changed += 1;
      if (changes.length < 20) {
        changes.push({
          sku,
          from: {
            name: beforeName,
            colors: beforeColorNames,
            composition: beforeComposition,
            care: beforeCare,
            category: beforeCategory
          },
          to: {
            name: next.name,
            colors: Array.isArray(next.colors) ? next.colors.map((c) => c?.name) : null,
            composition: next.composition,
            care: next.care,
            category: next.category
          }
        });
      }
    }
  }

  if (!dryRun) {
    await fs.writeFile(productsJsonPath, JSON.stringify(products, null, 2) + "\n", "utf-8");
  }

  console.log(JSON.stringify({ dryRun, productsJsonPath, combinedCardsPath, changed, sample: changes }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

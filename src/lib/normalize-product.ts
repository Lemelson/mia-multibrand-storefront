import type { Product } from "@/lib/types";

function normalizeSpace(value: string): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isMaxMaraProduct(product: Pick<Product, "brand" | "slug">): boolean {
  const brand = normalizeSpace(product.brand).toLowerCase();
  const slug = normalizeSpace(product.slug).toLowerCase();
  return brand.startsWith("max mara") || slug.startsWith("maxmara-");
}

function stripMaxMaraFromName(value: string): string {
  let s = normalizeSpace(value);
  if (!s) return s;

  // Remove redundant brand tokens; brand is already displayed separately.
  s = s
    .replace(/\bmax\s*mara\b/gi, "")
    .replace(/\bmaxmara\b/gi, "")
    .replace(/\bweekend\b/gi, "")
    .replace(/\s*цвет\s+[^()]+$/i, "")
    .replace(/\s*\(\s*\d+\s*\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();

  // Trim leftover punctuation without removing Cyrillic letters.
  s = s.replace(/^[\s.,:;!?()\[\]"'«»]+|[\s.,:;!?()\[\]"'«»]+$/g, "").trim();
  return s;
}

function normalizePercentZeros(value: string): string {
  return String(value || "").replace(/\b0+(\d+)\s*%/g, "$1%");
}

function normalizeCompositionText(value: string): string {
  let s = normalizeSpace(value);
  if (!s) return s;

  s = normalizePercentZeros(s);

  // Drop/translate common English labels that leak into RU compositions.
  // Examples: "Состав: fabric 92% Cotton, 8% Elastane"
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

function normalizeColorName(value: string): string {
  const raw = normalizeSpace(value);
  if (!raw) return raw;
  const parts = raw
    .split(",")
    .map((p) => normalizeSpace(p))
    .filter(Boolean)
    .map((p) => {
      if (/^[A-Z0-9 _-]+$/.test(p) && /[A-Z]/.test(p)) return p;
      const lower = p.toLowerCase();
      return lower ? lower[0].toUpperCase() + lower.slice(1) : lower;
    });
  return parts.join(", ");
}

function pickTypeFromText(text: string): string {
  const hay = normalizeSpace(text).toLowerCase();
  if (!hay) return "";
  const rules: Array<[RegExp, string]> = [
    [/джинсы|jeans/, "Джинсы"],
    [/мини-юбка|мини юбка/, "Мини-юбка"],
    [/юбк|skirt/, "Юбка"],
    [/брюки-палаццо|палаццо/, "Брюки-палаццо"],
    [/брюк|trouser|pants/, "Брюки"],
    [/шорт|shorts/, "Шорты"],
    [/плать|dress/, "Платье"],
    [/блуз|рубаш|shirt|blouse/, "Блузка"],
    [/футбол|t-?shirt/, "Футболка"],
    [/джемпер|свитер|кардиган|sweater|cardigan/, "Джемпер"],
    [/толстовк|худи|hoodie|sweatshirt/, "Толстовка"],
    [/жакет|пиджак|blazer/, "Жакет"],
    [/куртк|бомбер|puffer/, "Куртка"],
    [/пальто|тренч|coat|trench/, "Пальто"],
    [/кроссов|сникер|sneaker/, "Кроссовки"],
    [/ботин|boot/, "Ботинки"],
    [/туфл|loafer|pump/, "Туфли"],
    [/босонож|сандал|sandal/, "Босоножки"],
    [/ожерель|necklace/, "Ожерелье"]
  ];
  for (const [re, label] of rules) {
    if (re.test(hay)) return label;
  }
  return "";
}

function hasWordToken(hay: string, token: string): boolean {
  return new RegExp(`(^|[\\s\\-–—])${token}($|[\\s\\-–—])`, "i").test(hay);
}

function buildShortMaxMaraName(params: { name: string; description: string; composition: string }): string {
  const description = normalizeSpace(params.description);
  const hay = `${params.name} ${description}`.toLowerCase();

  const type = pickTypeFromText(hay) || "Изделие";
  const hasDenim = /(деним|джинс|jean)/i.test(hay);
  const isMini = hasWordToken(hay, "мини") || /мини-юбка/i.test(hay);
  const isMidi = hasWordToken(hay, "миди");
  const isMaxi = hasWordToken(hay, "макси");
  const hasPrint = /(принт|print)/i.test(hay);
  const isOversize = /(оверсайз|oversize)/i.test(hay);

  // Prefer the most user-visible qualifiers (keep it short).
  if ((type === "Юбка" || type === "Мини-юбка") && hasDenim) {
    if (isMini) return "Джинсовая мини-юбка";
    if (isMidi) return "Джинсовая юбка-миди";
    if (isMaxi) return "Джинсовая юбка-макси";
    return "Джинсовая юбка";
  }

  const parts: string[] = [];
  parts.push(type);

  if (hasPrint) parts.push("с принтом");
  if (isOversize) parts.push("оверсайз");

  // Add primary fiber only if it keeps name readable.
  const comp = normalizeCompositionText(params.composition);
  const compLower = comp.toLowerCase();
  let fiber = "";
  if (compLower.includes("кашемир")) fiber = "кашемира";
  else if (compLower.includes("шерсть virgin")) fiber = "шерсти virgin";
  else if (compLower.includes("шерсть")) fiber = "шерсти";
  else if (compLower.includes("шелк")) fiber = "шелка";
  else if (compLower.includes("хлопок")) fiber = "хлопка";
  else if (compLower.includes("ацетат")) fiber = "ацетата";
  else if (compLower.includes("вискоза")) fiber = "вискозы";
  else if (compLower.includes("кожа")) fiber = "кожи";
  else if (compLower.includes("металл") && compLower.includes("стекл")) fiber = "металла и стекла";

  const alreadyHasIz = parts.some((p) => p.startsWith("из "));
  if (fiber && parts.length < 3 && !alreadyHasIz) parts.push(`из ${fiber}`);

  return normalizeSpace(parts.join(" "));
}

function shouldRewriteName(product: Product): boolean {
  const name = normalizeSpace(product.name);
  if (!name) return true;
  if (/max\s*mara/i.test(name)) return true;

  // Too-generic titles for this brand are often DB leftovers.
  if (/^(юбка|брюки|футболка|куртка|жакет|платье|джинсы)$/i.test(name)) return true;
  return false;
}

export function normalizeProductForDisplay(product: Product): Product {
  if (!isMaxMaraProduct(product)) {
    return product;
  }

  const out: Product = { ...product };

  out.composition = normalizeCompositionText(out.composition);
  out.care = normalizePercentZeros(out.care);

  out.colors = Array.isArray(out.colors)
    ? out.colors.map((c) => ({ ...c, name: normalizeColorName(c.name) }))
    : out.colors;

  if (shouldRewriteName(out)) {
    const stripped = stripMaxMaraFromName(out.name);
    out.name = buildShortMaxMaraName({
      name: stripped || out.name,
      description: out.description,
      composition: out.composition
    });
  } else {
    out.name = stripMaxMaraFromName(out.name);
  }

  return out;
}


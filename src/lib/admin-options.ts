import type { Gender, ProductSize } from "@/lib/types";

export interface AdminColorOption {
  name: string;
  hex: string;
}

export interface AdminSizeDraft {
  size: string;
  inStock: boolean;
  quantity: string;
}

export const ADMIN_BRAND_OPTIONS = [
  "Twinset Milano",
  "Liu Jo",
  "Pinko",
  "Patrizia Pepe",
  "Max Mara",
  "Hugo Boss",
  "Furla"
] as const;

export const ADMIN_COLOR_OPTIONS: AdminColorOption[] = [
  { name: "Черный", hex: "#1f1f1f" },
  { name: "Белый", hex: "#f5f5f3" },
  { name: "Молочный", hex: "#ece6dc" },
  { name: "Бежевый", hex: "#d4b896" },
  { name: "Песочный", hex: "#c9b08a" },
  { name: "Коричневый", hex: "#7a5a3b" },
  { name: "Графит", hex: "#5a5e66" },
  { name: "Серый", hex: "#9aa0a6" },
  { name: "Темно-синий", hex: "#1d2a44" },
  { name: "Голубой", hex: "#a8c7e5" },
  { name: "Зеленый", hex: "#4f6b4a" },
  { name: "Оливковый", hex: "#7a8450" },
  { name: "Красный", hex: "#a23b3b" },
  { name: "Бордовый", hex: "#6f2534" },
  { name: "Розовый", hex: "#d8a2b3" },
  { name: "Лавандовый", hex: "#b6a6d7" }
];

const WOMEN_APPAREL_SIZES = ["XS", "S", "M", "L", "XL", "XXL"];
const MEN_APPAREL_SIZES = ["S", "M", "L", "XL", "XXL", "XXXL"];
const KIDS_SIZES = ["98", "104", "110", "116", "122", "128", "134", "140", "146", "152"];
const WOMEN_SHOE_SIZES = ["35", "36", "37", "38", "39", "40", "41"];
const MEN_SHOE_SIZES = ["39", "40", "41", "42", "43", "44", "45", "46"];
const WOMEN_JEANS_SIZES = ["24", "25", "26", "27", "28", "29", "30", "31", "32", "33"];
const MEN_JEANS_SIZES = ["28", "29", "30", "31", "32", "33", "34", "36", "38"];
const ONE_SIZE = ["U"];

function isShoesCategory(category: string): boolean {
  return /shoes|loafer|sneaker|boot|sandals?/i.test(category);
}

function isJeansCategory(category: string): boolean {
  return /jeans|denim/i.test(category);
}

function isAccessoriesCategory(category: string): boolean {
  return /accessor/i.test(category);
}

function getSizeTemplate(gender: Gender, category: string): string[] {
  if (isAccessoriesCategory(category)) {
    return ONE_SIZE;
  }

  if (isShoesCategory(category)) {
    if (gender === "men") {
      return MEN_SHOE_SIZES;
    }

    return WOMEN_SHOE_SIZES;
  }

  if (isJeansCategory(category)) {
    if (gender === "men") {
      return MEN_JEANS_SIZES;
    }

    return WOMEN_JEANS_SIZES;
  }

  if (gender === "men") {
    return MEN_APPAREL_SIZES;
  }

  if (gender === "kids") {
    return KIDS_SIZES;
  }

  return WOMEN_APPAREL_SIZES;
}

export function createSizeDrafts(gender: Gender, category: string, source?: ProductSize[]): AdminSizeDraft[] {
  const template = getSizeTemplate(gender, category);
  const sourceMap = new Map(
    (source ?? []).map((item) => [
      item.size.trim().toUpperCase(),
      {
        size: item.size,
        inStock: item.inStock,
        quantity:
          typeof item.quantity === "number" && Number.isFinite(item.quantity)
            ? String(item.quantity)
            : item.inStock
              ? "1"
              : "0"
      }
    ])
  );

  const rows: AdminSizeDraft[] = template.map((size) => {
    const fromSource = sourceMap.get(size.toUpperCase());

    if (fromSource) {
      return {
        size,
        inStock: fromSource.inStock,
        quantity: fromSource.quantity
      };
    }

    return {
      size,
      inStock: false,
      quantity: "0"
    };
  });

  for (const value of source ?? []) {
    const normalized = value.size.trim().toUpperCase();
    if (template.some((item) => item.toUpperCase() === normalized)) {
      continue;
    }

    rows.push({
      size: value.size,
      inStock: value.inStock,
      quantity:
        typeof value.quantity === "number" && Number.isFinite(value.quantity)
          ? String(value.quantity)
          : value.inStock
            ? "1"
            : "0"
    });
  }

  return rows;
}

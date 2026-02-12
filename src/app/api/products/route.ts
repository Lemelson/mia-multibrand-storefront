import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { createProduct, getProducts } from "@/lib/server-data";
import {
  createProductInputSchema,
  formatZodError,
  type CreateProductInput
} from "@/lib/validation";
import type { CatalogFilters } from "@/lib/types";

function parseList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseFiniteNumber(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseFilters(searchParams: URLSearchParams): CatalogFilters {
  const sortParam = searchParams.get("sort");
  const sort: CatalogFilters["sort"] =
    sortParam === "popular" || sortParam === "price-asc" || sortParam === "price-desc" || sortParam === "new"
      ? sortParam
      : "new";

  return {
    query: searchParams.get("q")?.trim() || undefined,
    sizes: parseList(searchParams.get("sizes")),
    brands: parseList(searchParams.get("brands")),
    colors: parseList(searchParams.get("colors")),
    inStockOnly: searchParams.get("inStock") === "1",
    saleOnly: searchParams.get("sale") === "1",
    sort,
    priceMin: parseFiniteNumber(searchParams.get("priceMin")),
    priceMax: parseFiniteNumber(searchParams.get("priceMax"))
  };
}

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  try {
    return verifyAdminToken(token);
  } catch {
    return false;
  }
}

function getStorageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (/EROFS|read-only|EACCES|EPERM/i.test(error.message)) {
      return "Текущий деплой работает с read-only файловой системой. Для Vercel включите БД-режим: DATA_SOURCE=db и корректные DATABASE_URL/DIRECT_URL.";
    }
    return error.message || fallback;
  }

  return fallback;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawPageSize = Number(searchParams.get("pageSize") ?? "20");

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 20;

  const products = await getProducts();
  const catalog = getCatalog(products, {
    gender: searchParams.get("gender") ?? undefined,
    category: searchParams.get("category") ?? undefined,
    storeId: searchParams.get("storeId") ?? undefined,
    page,
    pageSize,
    filters: parseFilters(searchParams)
  });

  return NextResponse.json(catalog);
}

export async function POST(request: Request) {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as unknown;
  const parsed = createProductInputSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const data: CreateProductInput = parsed.data;

  try {
    const product = await createProduct({
      sku: data.sku,
      slug: data.slug,
      name: data.name,
      brand: data.brand,
      description: data.description,
      composition: data.composition,
      care: data.care,
      category: data.category,
      gender: data.gender,
      price: data.price,
      oldPrice: data.oldPrice,
      colors: data.colors,
      stores: data.stores,
      isNew: data.isNew,
      isActive: data.isActive
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    const message = getStorageErrorMessage(error, "Не удалось создать товар");
    return NextResponse.json({ message }, { status: 500 });
  }
}

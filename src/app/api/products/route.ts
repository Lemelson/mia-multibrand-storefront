import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getCatalog } from "@/lib/catalog";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { createProduct, getProducts } from "@/lib/server-data";
import type { CatalogFilters, Product } from "@/lib/types";

function parseList(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseFilters(searchParams: URLSearchParams): CatalogFilters {
  const sortParam = searchParams.get("sort");
  const sort: CatalogFilters["sort"] =
    sortParam === "popular" || sortParam === "price-asc" || sortParam === "price-desc" || sortParam === "new"
      ? sortParam
      : "new";
  const priceMinValue = searchParams.get("priceMin");
  const priceMaxValue = searchParams.get("priceMax");

  return {
    sizes: parseList(searchParams.get("sizes")),
    brands: parseList(searchParams.get("brands")),
    colors: parseList(searchParams.get("colors")),
    inStockOnly: searchParams.get("inStock") === "1",
    saleOnly: searchParams.get("sale") === "1",
    sort,
    priceMin: priceMinValue ? Number(priceMinValue) : undefined,
    priceMax: priceMaxValue ? Number(priceMaxValue) : undefined
  };
}

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
}

function getStorageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (/EROFS|read-only|EACCES|EPERM/i.test(error.message)) {
      return "Текущий деплой работает с read-only файловой системой. Подключите БД или внешнее хранилище для сохранения изменений.";
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

  const payload = (await request.json()) as Partial<Product>;

  if (!payload.name || !payload.brand || !payload.gender || !payload.category || !payload.price) {
    return NextResponse.json(
      { message: "Missing required fields" },
      { status: 400 }
    );
  }

  try {
    const product = await createProduct({
      slug: payload.slug,
      name: payload.name,
      brand: payload.brand,
      description: payload.description ?? "",
      composition: payload.composition ?? "",
      care: payload.care ?? "",
      category: payload.category,
      gender: payload.gender,
      price: Number(payload.price),
      oldPrice: payload.oldPrice ? Number(payload.oldPrice) : undefined,
      colors: payload.colors ?? [],
      stores: payload.stores ?? [],
      isNew: Boolean(payload.isNew),
      isActive: payload.isActive ?? true
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    const message = getStorageErrorMessage(error, "Не удалось создать товар");
    return NextResponse.json({ message }, { status: 500 });
  }
}

import type { CatalogFilters, Product } from "@/lib/types";

export interface CatalogQuery {
  gender?: string;
  category?: string;
  storeId?: string;
  filters?: CatalogFilters;
  page?: number;
  pageSize?: number;
}

export interface CatalogResponse {
  items: Product[];
  total: number;
  hasMore: boolean;
  page: number;
  pageSize: number;
  brands: string[];
  sizes: string[];
  colors: string[];
  minPrice: number;
  maxPrice: number;
}

export function getCatalog(products: Product[], query: CatalogQuery): CatalogResponse {
  const {
    gender,
    category,
    storeId,
    filters,
    page = 1,
    pageSize = 20
  } = query;

  let filtered = products.filter((product) => product.isActive);

  if (storeId) {
    filtered = filtered.filter((product) =>
      product.stores.some((store) => store.storeId === storeId && store.available)
    );
  }

  if (gender) {
    filtered = filtered.filter((product) => product.gender === gender);
  }

  if (category) {
    filtered = filtered.filter((product) => product.category === category);
  }

  const allBrands = unique(filtered.map((product) => product.brand));
  const allSizes = unique(
    filtered.flatMap((product) =>
      product.colors.flatMap((color) => color.sizes.map((size) => size.size))
    )
  );
  const allColors = unique(filtered.flatMap((product) => product.colors.map((color) => color.name)));
  const prices = filtered.map((product) => product.price);

  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 0;

  if (filters) {
    if (filters.sizes.length > 0) {
      filtered = filtered.filter((product) =>
        product.colors.some((color) =>
          color.sizes.some((size) => filters.sizes.includes(size.size) && size.inStock)
        )
      );
    }

    if (filters.brands.length > 0) {
      filtered = filtered.filter((product) => filters.brands.includes(product.brand));
    }

    if (filters.colors.length > 0) {
      filtered = filtered.filter((product) =>
        product.colors.some((color) => filters.colors.includes(color.name))
      );
    }

    if (filters.priceMin !== undefined) {
      filtered = filtered.filter((product) => product.price >= filters.priceMin!);
    }

    if (filters.priceMax !== undefined) {
      filtered = filtered.filter((product) => product.price <= filters.priceMax!);
    }

    switch (filters.sort) {
      case "price-asc":
        filtered.sort((a, b) => a.price - b.price);
        break;
      case "price-desc":
        filtered.sort((a, b) => b.price - a.price);
        break;
      case "new":
        filtered.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
        break;
      default:
        filtered.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
    }
  } else {
    filtered.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
  }

  const total = filtered.length;
  const start = (page - 1) * pageSize;
  const end = start + pageSize;
  const items = filtered.slice(start, end);

  return {
    items,
    total,
    hasMore: end < total,
    page,
    pageSize,
    brands: allBrands,
    sizes: allSizes,
    colors: allColors,
    minPrice,
    maxPrice
  };
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values));
}

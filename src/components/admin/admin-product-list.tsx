"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import type {
  Category,
  Gender,
  Product
} from "@/lib/types";

type ProductFilterGender = Gender | "all";

interface AdminProductListProps {
  products: Product[];
  categories: Category[];
  mode: "active" | "hidden";
  onEdit: (product: Product) => void;
  onToggleActive: (product: Product) => void;
  onDelete: (id: string) => void;
}

export function AdminProductList({
  products,
  categories,
  mode,
  onEdit,
  onToggleActive,
  onDelete
}: AdminProductListProps) {
  const [productFilterGender, setProductFilterGender] = useState<ProductFilterGender>("all");
  const [productFilterCategory, setProductFilterCategory] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  const categoriesByGender = useMemo(() => {
    return {
      women: categories.filter((item) => item.gender === "women"),
      men: categories.filter((item) => item.gender === "men"),
      kids: categories.filter((item) => item.gender === "kids")
    };
  }, [categories]);

  const availableFilterCategories = useMemo(() => {
    if (productFilterGender === "all") {
      return categories;
    }

    return categoriesByGender[productFilterGender];
  }, [categories, categoriesByGender, productFilterGender]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    return products.filter((product) => {
      const byGender = productFilterGender === "all" || product.gender === productFilterGender;
      const byCategory = productFilterCategory === "all" || product.category === productFilterCategory;
      const bySearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.slug.toLowerCase().includes(query) ||
        (product.sku ?? "").toLowerCase().includes(query);

      return byGender && byCategory && bySearch;
    });
  }, [products, productFilterGender, productFilterCategory, productSearch]);

  return (
    <div className="space-y-3">
      <div className="space-y-2 border border-border p-3">
        <div className="grid gap-2 md:grid-cols-3">
          <select
            value={productFilterGender}
            onChange={(event) => {
              const nextGender = event.target.value as ProductFilterGender;
              setProductFilterGender(nextGender);
              setProductFilterCategory("all");
            }}
            className="border border-border px-3 py-2 text-sm"
          >
            <option value="all">Все: пол</option>
            <option value="women">Женское</option>
            <option value="men">Мужское</option>
            <option value="kids">Детское</option>
          </select>

          <select
            value={productFilterCategory}
            onChange={(event) => setProductFilterCategory(event.target.value)}
            className="border border-border px-3 py-2 text-sm"
          >
            <option value="all">Все категории</option>
            {availableFilterCategories.map((category) => (
              <option key={category.id} value={category.slug}>
                {category.name}
              </option>
            ))}
          </select>

          <input
            value={productSearch}
            onChange={(event) => setProductSearch(event.target.value)}
            placeholder="Поиск: название / артикул / slug"
            className="border border-border px-3 py-2 text-sm"
          />
        </div>

        <p className="text-xs text-text-secondary">
          Показано: {filteredProducts.length} из {products.length}
        </p>
      </div>

      {filteredProducts.length === 0 && (
        <div className="border border-border bg-bg-secondary px-5 py-8 text-sm text-text-secondary">
          {mode === "active"
            ? "Активных товаров по текущему фильтру нет."
            : "Скрытых товаров по текущему фильтру нет."}
        </div>
      )}

      {filteredProducts.map((product) => {
        const image = product.colors[0]?.images[0] ?? "https://picsum.photos/200/260";

        return (
          <article key={product.id} className="grid grid-cols-[72px_1fr] gap-4 border border-border p-3">
            <div className="relative h-24 w-[72px] overflow-hidden bg-bg-secondary">
              <Image src={image} alt={product.name} fill sizes="72px" className="object-cover" />
            </div>

            <div>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{product.brand}</p>
                  <h3 className="text-sm">{product.name}</h3>
                  <p className="mt-1 text-xs text-text-secondary">
                    {product.gender} · {product.category}
                  </p>
                  <p className="mt-1 text-sm font-medium">{formatPrice(product.price)}</p>
                </div>
                <span
                  className={`h-fit px-2 py-1 text-[10px] uppercase tracking-[0.08em] ${
                    product.isActive ? "bg-success/15 text-success" : "bg-error/15 text-error"
                  }`}
                >
                  {product.isActive ? "В каталоге" : "Скрыт"}
                </span>
              </div>

              <p className="mt-2 text-xs text-text-secondary">
                Магазины: {product.stores.filter((store) => store.available).length}
              </p>

              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => onEdit(product)}
                  className="border border-border px-2 py-1 text-[11px] uppercase tracking-[0.08em]"
                >
                  Редактировать
                </button>
                <button
                  type="button"
                  onClick={() => onToggleActive(product)}
                  className="border border-border px-2 py-1 text-[11px] uppercase tracking-[0.08em]"
                >
                  {mode === "active" ? "Скрыть" : "Вернуть"}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(product.id)}
                  className="border border-error px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-error"
                >
                  Удалить
                </button>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}

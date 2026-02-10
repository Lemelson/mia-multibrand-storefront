"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { X } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { useStore } from "@/components/providers/store-provider";
import type { Product } from "@/lib/types";

interface CatalogApiResponse {
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

interface CatalogViewProps {
  title: string;
  gender?: string;
  category?: string;
}

type SortOption = "popular" | "price-asc" | "price-desc" | "new";

const DEFAULT_SORT: SortOption = "new";

export function CatalogView({ title, gender, category }: CatalogViewProps) {
  const { selectedStoreId } = useStore();
  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [brands, setBrands] = useState<string[]>([]);
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(0);

  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [sort, setSort] = useState<SortOption>(DEFAULT_SORT);
  const [priceFrom, setPriceFrom] = useState<string>("");
  const [priceTo, setPriceTo] = useState<string>("");

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    params.set("sort", sort);
    params.set("storeId", selectedStoreId);

    if (gender) {
      params.set("gender", gender);
    }

    if (category) {
      params.set("category", category);
    }

    if (selectedBrands.length) {
      params.set("brands", selectedBrands.join(","));
    }

    if (selectedSizes.length) {
      params.set("sizes", selectedSizes.join(","));
    }

    if (selectedColors.length) {
      params.set("colors", selectedColors.join(","));
    }

    if (priceFrom) {
      params.set("priceMin", priceFrom);
    }

    if (priceTo) {
      params.set("priceMax", priceTo);
    }

    return params.toString();
  }, [
    page,
    sort,
    selectedStoreId,
    gender,
    category,
    selectedBrands,
    selectedSizes,
    selectedColors,
    priceFrom,
    priceTo
  ]);

  const loadCatalog = useCallback(
    async (mode: "replace" | "append") => {
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const response = await fetch(`/api/products?${queryString}`, {
        cache: "no-store"
      });
      const data = (await response.json()) as CatalogApiResponse;

      setBrands(data.brands);
      setSizes(data.sizes);
      setColors(data.colors);
      setMinPrice(data.minPrice);
      setMaxPrice(data.maxPrice);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setItems((current) => (mode === "replace" ? data.items : [...current, ...data.items]));

      setLoading(false);
      setLoadingMore(false);
    },
    [queryString]
  );

  useEffect(() => {
    loadCatalog(page === 1 ? "replace" : "append");
  }, [queryString, page, loadCatalog]);

  useEffect(() => {
    setPage(1);
  }, [selectedStoreId, gender, category, sort, selectedBrands, selectedSizes, selectedColors, priceFrom, priceTo]);

  function toggleValue(setter: Dispatch<SetStateAction<string[]>>, value: string) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  const activeTags = useMemo(() => {
    return [
      ...selectedBrands.map((value) => ({ group: "brand" as const, value })),
      ...selectedSizes.map((value) => ({ group: "size" as const, value })),
      ...selectedColors.map((value) => ({ group: "color" as const, value })),
      ...(priceFrom ? [{ group: "priceFrom" as const, value: `от ${priceFrom}` }] : []),
      ...(priceTo ? [{ group: "priceTo" as const, value: `до ${priceTo}` }] : [])
    ];
  }, [selectedBrands, selectedSizes, selectedColors, priceFrom, priceTo]);

  function clearTag(group: string, value: string) {
    if (group === "brand") {
      setSelectedBrands((current) => current.filter((item) => item !== value));
      return;
    }

    if (group === "size") {
      setSelectedSizes((current) => current.filter((item) => item !== value));
      return;
    }

    if (group === "color") {
      setSelectedColors((current) => current.filter((item) => item !== value));
      return;
    }

    if (group === "priceFrom") {
      setPriceFrom("");
      return;
    }

    setPriceTo("");
  }

  function clearAll() {
    setSelectedBrands([]);
    setSelectedSizes([]);
    setSelectedColors([]);
    setPriceFrom("");
    setPriceTo("");
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="font-logo text-3xl md:text-[42px]">{title}</h1>
        <p className="text-sm text-text-secondary">{total} товаров</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr] xl:gap-8">
        <aside className="h-fit border border-border bg-bg-secondary/40 p-4 lg:sticky lg:top-28">
          <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
            <h2 className="text-xs uppercase tracking-[0.1em]">Фильтры</h2>
            <button
              type="button"
              className="text-[11px] uppercase tracking-[0.08em] text-text-secondary"
              onClick={clearAll}
            >
              Сбросить
            </button>
          </div>

          <div className="space-y-4">
            <FilterSelect
              label="Размер"
              options={sizes}
              selected={selectedSizes}
              onToggle={(value) => toggleValue(setSelectedSizes, value)}
            />
            <FilterSelect
              label="Бренд"
              options={brands}
              selected={selectedBrands}
              onToggle={(value) => toggleValue(setSelectedBrands, value)}
            />
            <FilterSelect
              label="Цвет"
              options={colors}
              selected={selectedColors}
              onToggle={(value) => toggleValue(setSelectedColors, value)}
            />

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.08em] text-text-muted">Цена</p>
              <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-sm">
                <input
                  value={priceFrom}
                  onChange={(event) => setPriceFrom(event.target.value.replace(/\D/g, ""))}
                  placeholder={String(minPrice || 0)}
                  className="w-full border border-border bg-white px-3 py-2"
                />
                <span>—</span>
                <input
                  value={priceTo}
                  onChange={(event) => setPriceTo(event.target.value.replace(/\D/g, ""))}
                  placeholder={String(maxPrice || 0)}
                  className="w-full border border-border bg-white px-3 py-2"
                />
              </div>
            </div>

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.08em] text-text-muted">Сортировка</p>
              <select
                value={sort}
                onChange={(event) => setSort(event.target.value as SortOption)}
                className="w-full border border-border bg-white px-3 py-2 text-sm"
              >
                <option value="popular">По популярности</option>
                <option value="price-asc">По цене ↑</option>
                <option value="price-desc">По цене ↓</option>
                <option value="new">Новинки</option>
              </select>
            </div>
          </div>

          {activeTags.length > 0 && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="flex flex-wrap gap-2">
                {activeTags.map((tag) => (
                  <button
                    key={`${tag.group}-${tag.value}`}
                    type="button"
                    className="inline-flex items-center gap-1 border border-border bg-white px-2 py-1 text-[11px]"
                    onClick={() => clearTag(tag.group, tag.value.replace(/^от\s|^до\s/, ""))}
                  >
                    {tag.value}
                    <X size={11} />
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        <div>
          {loading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 xl:gap-4">
              {Array.from({ length: 8 }).map((_, index) => (
                <div key={index} className="animate-pulse">
                  <div className="aspect-[3/4] bg-bg-secondary" />
                  <div className="mt-2 h-3 w-20 bg-bg-secondary" />
                  <div className="mt-2 h-3 w-32 bg-bg-secondary" />
                  <div className="mt-2 h-3 w-14 bg-bg-secondary" />
                </div>
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="border border-border bg-bg-secondary px-6 py-10 text-center text-sm text-text-secondary">
              Товары не найдены для выбранных фильтров.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4 xl:gap-4">
                {items.map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {hasMore && (
                <div className="mt-10 text-center">
                  <button
                    type="button"
                    className="border border-text-primary px-8 py-3 text-xs uppercase tracking-[0.08em]"
                    onClick={() => setPage((current) => current + 1)}
                    disabled={loadingMore}
                  >
                    {loadingMore ? "Загрузка..." : "Показать еще"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}

interface FilterSelectProps {
  label: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}

function FilterSelect({ label, options, selected, onToggle }: FilterSelectProps) {
  return (
    <div>
      <p className="mb-2 text-xs uppercase tracking-[0.08em] text-text-muted">{label}</p>
      <div className="max-h-36 overflow-auto border border-border bg-white p-2 text-sm">
        {options.length === 0 ? (
          <p className="text-text-muted">Нет опций</p>
        ) : (
          <div className="space-y-2">
            {options.map((option) => (
              <label key={option} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.includes(option)}
                  onChange={() => onToggle(option)}
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

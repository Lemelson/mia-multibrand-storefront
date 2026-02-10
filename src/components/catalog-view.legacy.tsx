"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction
} from "react";
import { Check, ChevronDown } from "lucide-react";
import { ProductCard } from "@/components/product-card";
import { useStore } from "@/components/providers/store-provider";
import type { Category, Product } from "@/lib/types";

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
  sidebarCategories: Category[];
  activeCategorySlug?: string;
}

type MenuKey = "size" | "color" | "availability" | "sort";
type SortUi = "relevance" | "newest" | "best" | "price-desc" | "price-asc";
type AvailabilityMode = "selected" | "specific" | "any";

const SORT_OPTIONS: Array<{ value: SortUi; label: string }> = [
  { value: "relevance", label: "Relevance" },
  { value: "newest", label: "Newest first" },
  { value: "best", label: "Best selling" },
  { value: "price-desc", label: "Price: High to Low" },
  { value: "price-asc", label: "Price: Low to High" }
];

const COLOR_PALETTE: Record<string, string> = {
  "черный": "#1f1f1f",
  "темно-синий": "#1d2a44",
  "белый": "#f5f5f3",
  "молочный": "#ece6dc",
  "графит": "#5a5e66",
  "бежевый": "#d4b896",
  "песочный": "#c9b08a",
  "голубой": "#a8c7e5",
  "лавандовый": "#b6a6d7",
  "оливковый": "#7a8450"
};

function toCatalogSort(sort: SortUi): "popular" | "new" | "price-asc" | "price-desc" {
  switch (sort) {
    case "newest":
      return "new";
    case "price-asc":
      return "price-asc";
    case "price-desc":
      return "price-desc";
    default:
      return "popular";
  }
}

export function CatalogView({
  title,
  gender,
  category,
  sidebarCategories,
  activeCategorySlug
}: CatalogViewProps) {
  const { selectedStoreId, selectedStore, stores } = useStore();

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);

  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);

  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [inStockOnly, setInStockOnly] = useState(false);
  const [sortUi, setSortUi] = useState<SortUi>("relevance");

  const [availabilityMode, setAvailabilityMode] = useState<AvailabilityMode>("selected");
  const [availabilityStoreId, setAvailabilityStoreId] = useState<string>(selectedStoreId);

  const [openMenu, setOpenMenu] = useState<MenuKey | null>(null);
  const filterBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (filterBarRef.current && !filterBarRef.current.contains(target)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const effectiveStoreId =
    availabilityMode === "any"
      ? undefined
      : availabilityMode === "specific"
        ? availabilityStoreId
        : selectedStoreId;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    params.set("sort", toCatalogSort(sortUi));

    if (effectiveStoreId) {
      params.set("storeId", effectiveStoreId);
    }

    if (gender) {
      params.set("gender", gender);
    }

    if (category) {
      params.set("category", category);
    }

    if (selectedSizes.length) {
      params.set("sizes", selectedSizes.join(","));
    }

    if (selectedColors.length) {
      params.set("colors", selectedColors.join(","));
    }

    if (inStockOnly) {
      params.set("inStock", "1");
    }

    return params.toString();
  }, [page, sortUi, effectiveStoreId, gender, category, selectedSizes, selectedColors, inStockOnly]);

  const loadCatalog = useCallback(
    async (mode: "replace" | "append") => {
      if (mode === "replace") {
        setLoading(true);
      } else {
        setLoadingMore(true);
      }

      const response = await fetch(`/api/products?${queryString}`, { cache: "no-store" });
      const data = (await response.json()) as CatalogApiResponse;

      setSizes(data.sizes);
      setColors(data.colors);
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
  }, [selectedStoreId, availabilityMode, availabilityStoreId, gender, category, sortUi, selectedSizes, selectedColors, inStockOnly]);

  useEffect(() => {
    if (!stores.some((store) => store.id === availabilityStoreId)) {
      setAvailabilityStoreId(stores[0]?.id ?? selectedStoreId);
    }
  }, [stores, availabilityStoreId, selectedStoreId]);

  const colorOptions = useMemo(() => {
    const base = [...colors];

    if (base.length > 0 && !base.includes("__MULTICOLOR__")) {
      base.push("__MULTICOLOR__");
    }

    return base;
  }, [colors]);

  const availabilityLabel = useMemo(() => {
    if (availabilityMode === "any") {
      return inStockOnly ? "In stock · Any store" : "Any store";
    }

    const storeName =
      availabilityMode === "specific"
        ? stores.find((store) => store.id === availabilityStoreId)?.name
        : selectedStore.name;

    if (!storeName) {
      return inStockOnly ? "In stock" : "Availability";
    }

    return inStockOnly ? `In stock · ${storeName}` : storeName;
  }, [availabilityMode, inStockOnly, stores, availabilityStoreId, selectedStore.name]);

  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortUi)?.label ?? "Relevance";

  function toggleValue(setter: Dispatch<SetStateAction<string[]>>, value: string) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  return (
    <section>
      <div className="mb-6 flex items-end justify-between gap-4">
        <h1 className="font-logo text-3xl md:text-[42px]">{title}</h1>
        <p className="text-sm text-text-secondary">{total} товаров</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr] xl:gap-8">
        <aside className="h-fit border-r border-border pr-4 lg:sticky lg:top-28">
          <p className="mb-4 text-sm text-text-secondary">{title}</p>
          <nav className="space-y-1 text-[15px]">
            {gender && (
              <Link
                href={`/catalog/${gender}?sort=new`}
                className="block px-1 py-2 text-text-secondary hover:text-text-primary"
              >
                New in
              </Link>
            )}

            {sidebarCategories.map((item) => {
              const active = activeCategorySlug === item.slug;
              return (
                <Link
                  key={item.id}
                  href={`/catalog/${item.slug}`}
                  className={`block px-1 py-2 transition ${
                    active ? "text-text-primary" : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div>
          <div ref={filterBarRef} className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <DropdownFilter
                open={openMenu === "size"}
                onToggle={() => setOpenMenu((current) => (current === "size" ? null : "size"))}
                label={selectedSizes.length > 0 ? `Size (${selectedSizes.length})` : "Size"}
              >
                <FilterCheckList
                  options={sizes}
                  selected={selectedSizes}
                  onToggle={(value) => toggleValue(setSelectedSizes, value)}
                />
              </DropdownFilter>

              <DropdownFilter
                open={openMenu === "color"}
                onToggle={() => setOpenMenu((current) => (current === "color" ? null : "color"))}
                label={selectedColors.length > 0 ? `Colour (${selectedColors.length})` : "Colour"}
              >
                <div className="space-y-1">
                  {colorOptions.map((color) => {
                    const selected = selectedColors.includes(color);
                    const isMulticolor = color === "__MULTICOLOR__";
                    const label = isMulticolor ? "Multicolor" : color;
                    const hex = isMulticolor ? "#b7a594" : getColorHex(color);

                    return (
                      <button
                        key={color}
                        type="button"
                        onClick={() => toggleValue(setSelectedColors, color)}
                        className={`flex w-full items-center gap-2 px-2 py-2 text-left text-sm ${selected ? "bg-bg-secondary" : "hover:bg-bg-secondary/60"}`}
                      >
                        <span className="inline-block h-4 w-4 rounded-full border border-border" style={{ backgroundColor: hex }} />
                        <span>{label}</span>
                        {selected && <Check size={14} className="ml-auto" />}
                      </button>
                    );
                  })}
                </div>
              </DropdownFilter>

              <DropdownFilter
                open={openMenu === "availability"}
                onToggle={() => setOpenMenu((current) => (current === "availability" ? null : "availability"))}
                label={availabilityLabel}
              >
                <div className="space-y-2 px-2 py-1">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={inStockOnly}
                      onChange={(event) => setInStockOnly(event.target.checked)}
                    />
                    In stock
                  </label>

                  <div className="border-t border-border pt-2 text-sm">
                    <p className="mb-2 text-xs uppercase tracking-[0.08em] text-text-muted">Store</p>
                    <label className="mb-1 flex items-center gap-2">
                      <input
                        type="radio"
                        name="availability-store"
                        checked={availabilityMode === "selected"}
                        onChange={() => setAvailabilityMode("selected")}
                      />
                      Selected ({selectedStore.name})
                    </label>
                    <label className="mb-1 flex items-center gap-2">
                      <input
                        type="radio"
                        name="availability-store"
                        checked={availabilityMode === "any"}
                        onChange={() => setAvailabilityMode("any")}
                      />
                      Any store
                    </label>
                    <label className="mb-2 flex items-center gap-2">
                      <input
                        type="radio"
                        name="availability-store"
                        checked={availabilityMode === "specific"}
                        onChange={() => setAvailabilityMode("specific")}
                      />
                      Choose store
                    </label>

                    {availabilityMode === "specific" && (
                      <select
                        value={availabilityStoreId}
                        onChange={(event) => setAvailabilityStoreId(event.target.value)}
                        className="w-full border border-border px-2 py-2 text-sm"
                      >
                        {stores.map((store) => (
                          <option key={store.id} value={store.id}>
                            {store.name}, {store.city}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </DropdownFilter>
            </div>

            <DropdownFilter
              open={openMenu === "sort"}
              onToggle={() => setOpenMenu((current) => (current === "sort" ? null : "sort"))}
              label={sortLabel}
              alignRight
            >
              <div className="space-y-1">
                {SORT_OPTIONS.map((option) => {
                  const active = sortUi === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setSortUi(option.value);
                        setOpenMenu(null);
                      }}
                      className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm ${
                        active ? "bg-bg-secondary" : "hover:bg-bg-secondary/60"
                      }`}
                    >
                      {option.label}
                      {active && <Check size={14} />}
                    </button>
                  );
                })}
              </div>
            </DropdownFilter>
          </div>

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
              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-3 xl:gap-4">
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

function getColorHex(name: string): string {
  const key = name.trim().toLowerCase();
  return COLOR_PALETTE[key] ?? "#b9b9b9";
}

interface DropdownFilterProps {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  alignRight?: boolean;
}

function DropdownFilter({ label, open, onToggle, children, alignRight = false }: DropdownFilterProps) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        className="inline-flex items-center gap-2 text-sm text-text-primary"
      >
        {label}
        <ChevronDown size={14} className={open ? "rotate-180 transition" : "transition"} />
      </button>

      {open && (
        <div
          className={`absolute top-[calc(100%+8px)] z-30 min-w-[220px] border border-border bg-white p-2 shadow-lg ${
            alignRight ? "right-0" : "left-0"
          }`}
        >
          {children}
        </div>
      )}
    </div>
  );
}

interface FilterCheckListProps {
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
}

function FilterCheckList({ options, selected, onToggle }: FilterCheckListProps) {
  return (
    <div className="max-h-72 overflow-auto">
      {options.length === 0 ? (
        <p className="px-2 py-1 text-sm text-text-muted">Нет опций</p>
      ) : (
        options.map((option) => {
          const active = selected.includes(option);
          return (
            <button
              key={option}
              type="button"
              onClick={() => onToggle(option)}
              className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm ${
                active ? "bg-bg-secondary" : "hover:bg-bg-secondary/60"
              }`}
            >
              {option}
              {active && <Check size={14} />}
            </button>
          );
        })
      )}
    </div>
  );
}

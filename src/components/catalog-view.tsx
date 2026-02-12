"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
  brandCounts: Record<string, number>;
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

type MenuKey = "brand" | "size" | "color" | "price" | "sale" | "sort";
type SortUi = "relevance" | "newest" | "best" | "price-desc" | "price-asc";

const SORT_OPTIONS: Array<{ value: SortUi; label: string }> = [
  { value: "relevance", label: "По релевантности" },
  { value: "newest", label: "Сначала новые" },
  { value: "best", label: "Хиты продаж" },
  { value: "price-desc", label: "Сначала дорогие" },
  { value: "price-asc", label: "Сначала недорогие" }
];

const SIZE_RANK: Record<string, number> = {
  "ONE SIZE": 0,
  ONE: 0,
  OS: 0,
  XXS: 1,
  XS: 2,
  S: 3,
  M: 4,
  L: 5,
  XL: 6,
  XXL: 7,
  XXXL: 8
};

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
  const { selectedStoreId } = useStore();
  const searchParams = useSearchParams();
  const searchQuery = (searchParams.get("q") ?? "").trim();

  const [items, setItems] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [page, setPage] = useState(1);

  const [brands, setBrands] = useState<string[]>([]);
  const [brandCounts, setBrandCounts] = useState<Record<string, number>>({});
  const [sizes, setSizes] = useState<string[]>([]);
  const [colors, setColors] = useState<string[]>([]);
  const [priceBounds, setPriceBounds] = useState<{ min: number; max: number }>({ min: 0, max: 0 });

  const [selectedBrand, setSelectedBrand] = useState<string | null>(null);
  const [selectedSizes, setSelectedSizes] = useState<string[]>([]);
  const [selectedColors, setSelectedColors] = useState<string[]>([]);
  const [saleOnly, setSaleOnly] = useState(false);
  const [sortUi, setSortUi] = useState<SortUi>("relevance");

  const [priceMinApplied, setPriceMinApplied] = useState<number | undefined>();
  const [priceMaxApplied, setPriceMaxApplied] = useState<number | undefined>();
  const [priceFromInput, setPriceFromInput] = useState("");
  const [priceToInput, setPriceToInput] = useState("");

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

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "20");
    params.set("sort", toCatalogSort(sortUi));
    params.set("storeId", selectedStoreId);

    if (gender) {
      params.set("gender", gender);
    }

    if (category) {
      params.set("category", category);
    }

    if (selectedSizes.length) {
      params.set("sizes", selectedSizes.join(","));
    }

    if (selectedBrand) {
      params.set("brands", selectedBrand);
    }

    if (selectedColors.length) {
      params.set("colors", selectedColors.join(","));
    }

    if (saleOnly) {
      params.set("sale", "1");
    }

    if (priceMinApplied !== undefined) {
      params.set("priceMin", String(priceMinApplied));
    }

    if (priceMaxApplied !== undefined) {
      params.set("priceMax", String(priceMaxApplied));
    }

    if (searchQuery) {
      params.set("q", searchQuery);
    }

    return params.toString();
  }, [
    page,
    sortUi,
    selectedStoreId,
    gender,
    category,
    selectedSizes,
    selectedBrand,
    selectedColors,
    saleOnly,
    priceMinApplied,
    priceMaxApplied,
    searchQuery
  ]);

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
      setBrands(data.brands);
      setBrandCounts(data.brandCounts ?? {});
      setSelectedBrand((current) => (current && data.brands.includes(current) ? current : null));
      setColors(data.colors);
      setHasMore(data.hasMore);
      setPriceBounds({ min: data.minPrice, max: data.maxPrice });
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
  }, [
    selectedStoreId,
    gender,
    category,
    sortUi,
    selectedSizes,
    selectedBrand,
    selectedColors,
    saleOnly,
    priceMinApplied,
    priceMaxApplied,
    searchQuery
  ]);

  const parsedPriceFrom = priceFromInput ? Number(priceFromInput) : undefined;
  const parsedPriceTo = priceToInput ? Number(priceToInput) : undefined;
  const isPriceRangeInvalid =
    parsedPriceFrom !== undefined && parsedPriceTo !== undefined && parsedPriceFrom > parsedPriceTo;

  const sortedSizes = useMemo(() => {
    const unique = Array.from(new Set(sizes));
    return unique.sort((a, b) => compareSizes(a, b));
  }, [sizes]);

  const sortedBrands = useMemo(() => {
    const uniqueBrands = Array.from(new Set(brands)).filter(Boolean);
    return uniqueBrands.sort((a, b) => a.localeCompare(b, "ru"));
  }, [brands]);

  const brandOptions = useMemo(() => {
    const maxMaraFamily = sortedBrands.filter((brand) => brand.trim().toLowerCase().includes("max mara"));
    const others = sortedBrands.filter((brand) => !brand.trim().toLowerCase().includes("max mara"));

    const out: Array<
      | { kind: "group"; label: string }
      | { kind: "brand"; label: string; value: string; indent?: boolean; count: number }
    > = [];

    if (maxMaraFamily.length > 0) {
      out.push({ kind: "group", label: "Max Mara" });
      const ordered = [...maxMaraFamily].sort((a, b) => {
        const aKey = a.trim().toLowerCase() === "max mara" ? 0 : 1;
        const bKey = b.trim().toLowerCase() === "max mara" ? 0 : 1;
        if (aKey !== bKey) return aKey - bKey;
        return a.localeCompare(b, "ru");
      });
      for (const brand of ordered) {
        out.push({
          kind: "brand",
          label: brand,
          value: brand,
          indent: brand.trim().toLowerCase() !== "max mara",
          count: brandCounts[brand] ?? 0
        });
      }
    }

    for (const brand of others) {
      out.push({
        kind: "brand",
        label: brand,
        value: brand,
        count: brandCounts[brand] ?? 0
      });
    }

    return out;
  }, [sortedBrands, brandCounts]);

  const colorOptions = useMemo(() => {
    const base = [...colors];

    if (base.length > 0 && !base.includes("__MULTICOLOR__")) {
      base.push("__MULTICOLOR__");
    }

    return base;
  }, [colors]);

  const sortLabel = SORT_OPTIONS.find((option) => option.value === sortUi)?.label ?? "Сортировка";
  const saleLabel = saleOnly ? "Только со скидкой" : "Скидка";
  const priceLabel = useMemo(() => {
    if (priceMinApplied !== undefined && priceMaxApplied !== undefined) {
      return `Цена: ${formatNumber(priceMinApplied)} — ${formatNumber(priceMaxApplied)}`;
    }

    if (priceMinApplied !== undefined) {
      return `Цена от ${formatNumber(priceMinApplied)}`;
    }

    if (priceMaxApplied !== undefined) {
      return `Цена до ${formatNumber(priceMaxApplied)}`;
    }

    return "Цена";
  }, [priceMinApplied, priceMaxApplied]);

  function toggleValue(setter: Dispatch<SetStateAction<string[]>>, value: string) {
    setter((current) =>
      current.includes(value)
        ? current.filter((item) => item !== value)
        : [...current, value]
    );
  }

  return (
    <section>
      <div className="mb-6">
        <h1 className="font-logo text-3xl md:text-[42px]">{title}</h1>
        {searchQuery && (
          <p className="mt-1 text-sm text-text-secondary">
            Поиск: <span className="text-text-primary">«{searchQuery}»</span>
          </p>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-[260px_1fr] xl:gap-8">
        <aside className="h-fit pr-4 lg:sticky lg:top-28">
          <nav className="space-y-1 border-l border-border pl-3 text-[15px]">
            {gender && (
              <Link
                href={`/catalog/${gender}?sort=new`}
                className="block px-1 py-2 text-text-secondary hover:text-text-primary"
              >
                Новинки
              </Link>
            )}

            {sidebarCategories.map((item) => {
              const active = activeCategorySlug === item.slug;
              return (
                <Link
                  key={item.id}
                  href={`/catalog/${item.slug}`}
                  className={`block px-2 py-2 transition ${
                    active
                      ? "bg-[#efe8dd] text-text-primary"
                      : "text-text-secondary hover:bg-bg-secondary hover:text-text-primary"
                  }`}
                >
                  {item.name}
                </Link>
              );
            })}
          </nav>
        </aside>

        <div>
          <div ref={filterBarRef} className="mb-5 flex flex-wrap items-center justify-between gap-3 pb-3">
            <div className="flex flex-wrap items-center gap-3">
              <DropdownFilter
                open={openMenu === "brand"}
                onToggle={() => setOpenMenu((current) => (current === "brand" ? null : "brand"))}
                label="Бренд"
              >
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedBrand(null);
                      setOpenMenu(null);
                    }}
                    className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm ${
                      !selectedBrand ? "bg-bg-secondary" : "hover:bg-bg-secondary/60"
                    }`}
                  >
                    Все бренды
                    {!selectedBrand && <Check size={14} />}
                  </button>

                  <div className="max-h-72 overflow-auto">
                    {brandOptions.length === 0 ? (
                      <p className="px-2 py-1 text-sm text-text-muted">Нет опций</p>
                    ) : (
                      brandOptions.map((option) => {
                        if (option.kind === "group") {
                          return (
                            <p
                              key={`group:${option.label}`}
                              className="px-2 pt-3 text-[11px] font-medium uppercase tracking-[0.08em] text-text-muted"
                            >
                              {option.label}
                            </p>
                          );
                        }

                        const active = selectedBrand === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setSelectedBrand(option.value);
                              setOpenMenu(null);
                            }}
                            className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm ${
                              active ? "bg-bg-secondary" : "hover:bg-bg-secondary/60"
                            } ${option.indent ? "pl-6" : ""}`}
                          >
                            <span>
                              {option.label} ({option.count})
                            </span>
                            {active && <Check size={14} />}
                          </button>
                        );
                      })
                    )}
                  </div>
                </div>
              </DropdownFilter>

              <DropdownFilter
                open={openMenu === "size"}
                onToggle={() => setOpenMenu((current) => (current === "size" ? null : "size"))}
                label={selectedSizes.length > 0 ? `Размер (${selectedSizes.length})` : "Размер"}
              >
                <FilterCheckList
                  options={sortedSizes}
                  selected={selectedSizes}
                  onToggle={(value) => toggleValue(setSelectedSizes, value)}
                />
              </DropdownFilter>

              <DropdownFilter
                open={openMenu === "color"}
                onToggle={() => setOpenMenu((current) => (current === "color" ? null : "color"))}
                label={selectedColors.length > 0 ? `Цвет (${selectedColors.length})` : "Цвет"}
              >
                <div className="space-y-1">
                  {colorOptions.map((color) => {
                    const selected = selectedColors.includes(color);
                    const isMulticolor = color === "__MULTICOLOR__";
                    const label = isMulticolor ? "Мультиколор" : color;
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
                open={openMenu === "price"}
                onToggle={() => setOpenMenu((current) => (current === "price" ? null : "price"))}
                label={priceLabel}
              >
                <div className="w-[320px] space-y-3 px-1 py-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      value={priceFromInput}
                      onChange={(event) => setPriceFromInput(onlyDigits(event.target.value))}
                      placeholder={priceBounds.min ? `от ${formatNumber(priceBounds.min)}` : "от"}
                      className="h-11 w-full border border-border px-3 text-sm"
                    />
                    <span className="text-text-muted">—</span>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={priceToInput}
                      onChange={(event) => setPriceToInput(onlyDigits(event.target.value))}
                      placeholder={priceBounds.max ? `до ${formatNumber(priceBounds.max)}` : "до"}
                      className="h-11 w-full border border-border px-3 text-sm"
                    />
                  </div>

                  {isPriceRangeInvalid && (
                    <p className="text-xs text-error">Введите корректный диапазон цены.</p>
                  )}

                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        if (isPriceRangeInvalid) {
                          return;
                        }
                        setPriceMinApplied(parsedPriceFrom);
                        setPriceMaxApplied(parsedPriceTo);
                        setOpenMenu(null);
                      }}
                      disabled={isPriceRangeInvalid}
                      className="h-10 flex-1 border border-text-primary bg-text-primary px-3 text-xs uppercase tracking-[0.08em] text-white disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Применить
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPriceFromInput("");
                        setPriceToInput("");
                        setPriceMinApplied(undefined);
                        setPriceMaxApplied(undefined);
                        setOpenMenu(null);
                      }}
                      className="h-10 border border-border px-3 text-xs uppercase tracking-[0.08em]"
                    >
                      Сбросить
                    </button>
                  </div>
                </div>
              </DropdownFilter>

              <DropdownFilter
                open={openMenu === "sale"}
                onToggle={() => setOpenMenu((current) => (current === "sale" ? null : "sale"))}
                label={saleLabel}
              >
                <div className="space-y-1">
                  <button
                    type="button"
                    onClick={() => {
                      setSaleOnly(false);
                      setOpenMenu(null);
                    }}
                    className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm ${
                      !saleOnly ? "bg-bg-secondary" : "hover:bg-bg-secondary/60"
                    }`}
                  >
                    Все товары
                    {!saleOnly && <Check size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSaleOnly(true);
                      setOpenMenu(null);
                    }}
                    className={`flex w-full items-center justify-between px-2 py-2 text-left text-sm ${
                      saleOnly ? "bg-bg-secondary" : "hover:bg-bg-secondary/60"
                    }`}
                  >
                    Только со скидкой
                    {saleOnly && <Check size={14} />}
                  </button>
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
                {items.map((product, index) => (
                  <ProductCard key={product.id} product={product} priority={page === 1 && index < 6} />
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

function compareSizes(a: string, b: string): number {
  const normalizedA = a.trim().toUpperCase();
  const normalizedB = b.trim().toUpperCase();
  const rankA = SIZE_RANK[normalizedA] ?? Number.MAX_SAFE_INTEGER;
  const rankB = SIZE_RANK[normalizedB] ?? Number.MAX_SAFE_INTEGER;

  if (rankA !== rankB) {
    return rankA - rankB;
  }

  return normalizedA.localeCompare(normalizedB, "ru");
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
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

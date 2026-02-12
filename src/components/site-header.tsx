"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Heart, MapPin, Search, ShoppingBag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Container } from "@/components/container";
import { useCart } from "@/components/providers/cart-provider";
import { useFavorites } from "@/components/providers/favorites-provider";
import { useStore } from "@/components/providers/store-provider";
import { formatPrice } from "@/lib/format";
import type { Category } from "@/lib/types";

interface SiteHeaderProps {
  categories: Category[];
}

const GENDER_NAV_ITEMS = [
  { href: "/catalog/women", label: "Женщинам", gender: "women" },
  { href: "/catalog/men", label: "Мужчинам", gender: "men" },
  { href: "/catalog/kids", label: "Детям", gender: "kids" }
];

export function SiteHeader({ categories }: SiteHeaderProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const currentQuery = (searchParams.get("q") ?? "").trim();
  const { selectedStore, stores, setSelectedStoreId } = useStore();
  const { items, totalItems, totalAmount, removeItem } = useCart();
  const {
    items: favoriteItems,
    totalItems: favoriteTotal,
    removeItem: removeFavorite,
    clear: clearFavorites
  } = useFavorites();

  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [favoritesOpen, setFavoritesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const storeMenuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!searchOpen) {
      return;
    }

    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 40);

    return () => window.clearTimeout(timer);
  }, [searchOpen]);

  useEffect(() => {
    if (!searchOpen) {
      setSearchValue(currentQuery);
    }
  }, [currentQuery, searchOpen]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (storeMenuRef.current && !storeMenuRef.current.contains(target)) {
        setStoreMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, []);

  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
        setCartOpen(false);
        setFavoritesOpen(false);
        setSearchOpen(false);
        setStoreMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  useEffect(() => {
    if (!menuOpen && !cartOpen && !favoritesOpen && !searchOpen) {
      document.body.style.overflow = "";
      return;
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen, cartOpen, favoritesOpen, searchOpen]);

  const groupedCategories = useMemo(() => {
    return {
      women: categories.filter((category) => category.gender === "women"),
      men: categories.filter((category) => category.gender === "men"),
      kids: categories.filter((category) => category.gender === "kids")
    };
  }, [categories]);

  const activeGender = useMemo(() => {
    if (!pathname.startsWith("/catalog")) {
      return "";
    }

    const segment = pathname.split("/")[2];
    if (!segment) {
      return "";
    }

    if (segment === "women" || segment === "men" || segment === "kids") {
      return segment;
    }

    return categories.find((category) => category.slug === segment)?.gender ?? "";
  }, [pathname, categories]);

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const query = searchValue.trim();

    if (!query) {
      router.push("/catalog");
    } else {
      router.push(`/catalog?q=${encodeURIComponent(query)}`);
    }

    setSearchOpen(false);
  }

  const overlays = mounted
    ? createPortal(
        <>
          <AnimatePresence>
            {menuOpen && (
              <>
                <motion.div
                  className="fixed inset-0 z-[390] bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setMenuOpen(false)}
                />
                <motion.aside
                  className="fixed inset-y-0 left-0 z-[400] h-screen w-full max-w-sm overflow-auto bg-white px-6 py-6"
                  initial={{ x: "-100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "-100%" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <div className="mb-8 flex items-center justify-between">
                    <span className="font-logo text-3xl">MIA</span>
                    <button onClick={() => setMenuOpen(false)} type="button" aria-label="Закрыть меню">
                      <X size={20} />
                    </button>
                  </div>

                  <div className="space-y-6 text-sm uppercase tracking-[0.08em]">
                    <Link href="/catalog?sort=new" onClick={() => setMenuOpen(false)} className="block">
                      Новинки
                    </Link>
                    <Link href="/catalog?brands=" onClick={() => setMenuOpen(false)} className="block">
                      Бренды
                    </Link>

                    <div>
                      <Link href="/catalog/women" onClick={() => setMenuOpen(false)} className="mb-2 block">
                        Женщинам
                      </Link>
                      <div className="space-y-2 pl-3 text-xs text-text-secondary">
                        {groupedCategories.women.slice(0, 8).map((item) => (
                          <Link
                            key={item.id}
                            href={`/catalog/${item.slug}`}
                            onClick={() => setMenuOpen(false)}
                            className="block"
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Link href="/catalog/men" onClick={() => setMenuOpen(false)} className="mb-2 block">
                        Мужчинам
                      </Link>
                      <div className="space-y-2 pl-3 text-xs text-text-secondary">
                        {groupedCategories.men.slice(0, 8).map((item) => (
                          <Link
                            key={item.id}
                            href={`/catalog/${item.slug}`}
                            onClick={() => setMenuOpen(false)}
                            className="block"
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    </div>

                    <div>
                      <Link href="/catalog/kids" onClick={() => setMenuOpen(false)} className="mb-2 block">
                        Детям
                      </Link>
                      <div className="space-y-2 pl-3 text-xs text-text-secondary">
                        {groupedCategories.kids.map((item) => (
                          <Link
                            key={item.id}
                            href={`/catalog/${item.slug}`}
                            onClick={() => setMenuOpen(false)}
                            className="block"
                          >
                            {item.name}
                          </Link>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="my-8 border-t border-border pt-6 text-sm text-text-secondary">
                    <Link href="/contacts" onClick={() => setMenuOpen(false)} className="mb-3 block">
                      Контакты
                    </Link>
                    <Link href="/delivery" onClick={() => setMenuOpen(false)} className="mb-3 block">
                      Доставка и возврат
                    </Link>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {searchOpen && (
              <>
                <motion.div
                  className="fixed inset-0 z-[410] bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setSearchOpen(false)}
                />
                <motion.div
                  className="fixed left-1/2 top-20 z-[420] w-[calc(100%-24px)] max-w-2xl -translate-x-1/2 border border-border bg-white p-4 shadow-2xl md:p-6"
                  initial={{ opacity: 0, y: -12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -12 }}
                >
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg">Поиск по каталогу</h2>
                    <button type="button" onClick={() => setSearchOpen(false)} aria-label="Закрыть поиск">
                      <X size={20} />
                    </button>
                  </div>
                  <p className="mb-4 text-sm text-text-secondary">
                    Введите название, бренд или артикул. Нажмите Enter или кнопку поиска.
                  </p>
                  <form onSubmit={submitSearch} className="flex gap-2">
                    <input
                      ref={searchInputRef}
                      value={searchValue}
                      onChange={(event) => setSearchValue(event.target.value)}
                      placeholder="Например: пальто Twinset"
                      className="w-full border border-border px-3 py-2"
                    />
                    <button
                      type="submit"
                      className="border border-text-primary bg-text-primary px-4 py-2 text-xs uppercase tracking-[0.08em] text-white"
                    >
                      Поиск
                    </button>
                  </form>
                </motion.div>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {favoritesOpen && (
              <>
                <motion.div
                  className="fixed inset-0 z-[390] bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setFavoritesOpen(false)}
                />
                <motion.aside
                  className="fixed inset-y-0 right-0 z-[400] h-screen w-full max-w-md overflow-auto bg-white px-6 py-6"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-medium">Избранное ({favoriteTotal})</h2>
                    <button onClick={() => setFavoritesOpen(false)} type="button" aria-label="Закрыть избранное">
                      <X size={20} />
                    </button>
                  </div>

                  {favoriteItems.length === 0 && <p className="text-sm text-text-secondary">Пока ничего не добавлено</p>}

                  <div className="space-y-4">
                    {favoriteItems.map((item) => (
                      <div key={item.productId} className="flex gap-3 border-b border-border pb-4">
                        <Link href={`/product/${item.slug}`} onClick={() => setFavoritesOpen(false)} className="relative h-20 w-16 shrink-0 overflow-hidden bg-bg-secondary">
                          <Image alt={item.name} src={item.imageUrl} fill sizes="64px" className="object-cover" />
                        </Link>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{item.brand}</p>
                          <Link
                            href={`/product/${item.slug}`}
                            onClick={() => setFavoritesOpen(false)}
                            className="line-clamp-2 text-sm"
                          >
                            {item.name}
                          </Link>
                          <p className="mt-1 text-sm">{formatPrice(item.price)}</p>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-text-secondary"
                          onClick={() => removeFavorite(item.productId)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>

                  {favoriteItems.length > 0 && (
                    <button
                      type="button"
                      className="mt-6 w-full border border-border px-4 py-3 text-xs uppercase tracking-[0.08em]"
                      onClick={clearFavorites}
                    >
                      Очистить избранное
                    </button>
                  )}
                </motion.aside>
              </>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {cartOpen && (
              <>
                <motion.div
                  className="fixed inset-0 z-[390] bg-black/45"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setCartOpen(false)}
                />
                <motion.aside
                  className="fixed inset-y-0 right-0 z-[400] h-screen w-full max-w-md overflow-auto bg-white px-6 py-6"
                  initial={{ x: "100%" }}
                  animate={{ x: 0 }}
                  exit={{ x: "100%" }}
                  transition={{ duration: 0.3, ease: "easeOut" }}
                >
                  <div className="mb-6 flex items-center justify-between">
                    <h2 className="text-xl font-medium">Корзина ({totalItems})</h2>
                    <button onClick={() => setCartOpen(false)} type="button" aria-label="Закрыть корзину">
                      <X size={20} />
                    </button>
                  </div>

                  {items.length === 0 && <p className="text-sm text-text-secondary">Корзина пуста</p>}

                  <div className="space-y-4">
                    {items.map((item) => (
                      <div key={item.key} className="flex gap-3 border-b border-border pb-4">
                        <div className="relative h-20 w-16 shrink-0 overflow-hidden bg-bg-secondary">
                          <Image alt={item.name} src={item.imageUrl} fill sizes="64px" className="object-cover" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{item.brand}</p>
                          <p className="line-clamp-1 text-sm">{item.name}</p>
                          <p className="text-xs text-text-secondary">
                            {item.colorName} · {item.size}
                          </p>
                          <p className="mt-1 text-sm">
                            {formatPrice(item.price)} × {item.quantity}
                          </p>
                        </div>
                        <button
                          type="button"
                          className="text-xs text-text-secondary"
                          onClick={() => removeItem(item.key)}
                        >
                          Удалить
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="mt-6 border-t border-border pt-4">
                    <div className="mb-4 flex items-center justify-between text-sm">
                      <span>Итого</span>
                      <strong>{formatPrice(totalAmount)}</strong>
                    </div>
                    <Link
                      href="/checkout"
                      className="block bg-text-primary px-4 py-3 text-center text-xs uppercase tracking-[0.08em] text-white"
                      onClick={() => setCartOpen(false)}
                    >
                      Оформить заказ
                    </Link>
                    <Link
                      href="/cart"
                      className="mt-2 block border border-border px-4 py-3 text-center text-xs uppercase tracking-[0.08em]"
                      onClick={() => setCartOpen(false)}
                    >
                      Открыть корзину
                    </Link>
                  </div>
                </motion.aside>
              </>
            )}
          </AnimatePresence>
        </>,
        document.body
      )
    : null;

  return (
    <>
      <header className="sticky top-0 z-[140] border-b border-border bg-white">
        <div className="h-[env(safe-area-inset-top)] bg-white" />
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-1 md:gap-4">
              <button
                className="relative inline-flex h-9 w-9 items-center justify-center text-text-primary"
                onMouseEnter={() => {
                  if (window.matchMedia("(hover: hover) and (pointer: fine)").matches) {
                    setMenuOpen(true);
                  }
                }}
                onClick={() => setMenuOpen((value) => !value)}
                type="button"
                aria-label="Открыть меню"
              >
                <span
                  className={`absolute h-[1.5px] w-4 bg-current transition-transform duration-200 ${
                    menuOpen ? "translate-y-0 rotate-45" : "-translate-y-[4px]"
                  }`}
                />
                <span
                  className={`absolute h-[1.5px] w-4 bg-current transition-transform duration-200 ${
                    menuOpen ? "translate-y-0 -rotate-45" : "translate-y-[4px]"
                  }`}
                />
              </button>

              <nav className="hidden items-center gap-4 md:flex">
                {GENDER_NAV_ITEMS.map((item) => {
                  const active = activeGender === item.gender;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`border-b pb-1 text-[13px] uppercase tracking-[0.08em] transition ${
                        active
                          ? "border-text-primary text-text-primary"
                          : "border-transparent text-text-secondary hover:border-text-primary hover:text-text-primary"
                      }`}
                    >
                      {item.label}
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="absolute left-1/2 -translate-x-1/2">
              <Link href="/" className="font-logo text-[28px] font-medium tracking-[0.04em] md:text-[30px]">
                MIA
              </Link>
            </div>

            <div className="flex items-center gap-2 md:gap-3">
              <div ref={storeMenuRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => {
                    setStoreMenuOpen((value) => !value);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.08em] text-text-secondary"
                  aria-label="Выбор магазина"
                >
                  <MapPin size={13} />
                  {selectedStore.name}
                  <ChevronDown size={13} className={storeMenuOpen ? "rotate-180 transition" : "transition"} />
                </button>

                <AnimatePresence>
                  {storeMenuOpen && (
                    <motion.div
                      className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[220px] rounded-md border border-border bg-white p-1 shadow-lg"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      {stores.map((store) => {
                        const active = selectedStore.id === store.id;
                        return (
                          <button
                            key={store.id}
                            type="button"
                            onClick={() => {
                              setSelectedStoreId(store.id);
                              setStoreMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs uppercase tracking-[0.08em] ${
                              active ? "bg-text-primary text-white" : "hover:bg-bg-secondary"
                            }`}
                          >
                            <span>{store.name}</span>
                            {active && <Check size={13} />}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button
                className="text-text-primary"
                type="button"
                aria-label="Поиск"
                onClick={() => {
                  setSearchValue(currentQuery);
                  setSearchOpen(true);
                  setMenuOpen(false);
                  setCartOpen(false);
                  setFavoritesOpen(false);
                }}
              >
                <Search size={20} />
              </button>

              <button
                className="relative text-text-primary"
                type="button"
                aria-label="Избранное"
                onClick={() => {
                  setFavoritesOpen(true);
                  setMenuOpen(false);
                  setCartOpen(false);
                  setSearchOpen(false);
                }}
              >
                <Heart size={20} />
                {favoriteTotal > 0 && (
                  <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text-primary px-1 text-[10px] text-white">
                    {favoriteTotal}
                  </span>
                )}
              </button>

              <button
                className="relative text-text-primary"
                type="button"
                aria-label="Корзина"
                onClick={() => {
                  setCartOpen(true);
                  setMenuOpen(false);
                  setFavoritesOpen(false);
                  setSearchOpen(false);
                }}
              >
                <ShoppingBag size={20} />
                {totalItems > 0 && (
                  <span className="absolute -right-2 -top-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-text-primary px-1 text-[10px] text-white">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </Container>
      </header>
      {overlays}
    </>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown, Heart, MapPin, Menu, Search, ShoppingBag, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Container } from "@/components/container";
import { useCart } from "@/components/providers/cart-provider";
import { useFontTheme, type FontTheme } from "@/components/providers/font-theme-provider";
import { useStore } from "@/components/providers/store-provider";
import { formatPrice } from "@/lib/format";
import type { Category } from "@/lib/types";

interface SiteHeaderProps {
  categories: Category[];
}

const NAV_ITEMS = [
  { href: "/catalog/women", label: "Женское" },
  { href: "/catalog/men", label: "Мужское" },
  { href: "/catalog/kids", label: "Детское" },
  { href: "/catalog?sort=new", label: "Новинки" },
  { href: "/catalog?brands=", label: "Бренды" }
];

const FONT_BUTTON_LABELS: Record<FontTheme, string> = {
  current: "Текущий",
  proxima: "Proxima",
  montserrat: "Montserrat",
  sofia: "Sofia",
  gotham: "Gotham"
};

export function SiteHeader({ categories }: SiteHeaderProps) {
  const pathname = usePathname();
  const { selectedStore, stores, setSelectedStoreId } = useStore();
  const { theme, setTheme, options: fontOptions } = useFontTheme();
  const { items, totalItems, totalAmount, removeItem } = useCart();

  const [menuOpen, setMenuOpen] = useState(false);
  const [cartOpen, setCartOpen] = useState(false);
  const [compact, setCompact] = useState(false);
  const [storeMenuOpen, setStoreMenuOpen] = useState(false);
  const [fontMenuOpen, setFontMenuOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  const storeMenuRef = useRef<HTMLDivElement>(null);
  const fontMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let lastY = window.scrollY;

    const onScroll = () => {
      const currentY = window.scrollY;
      setCompact(currentY > 80 && currentY > lastY);
      lastY = currentY;
    };

    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (storeMenuRef.current && !storeMenuRef.current.contains(target)) {
        setStoreMenuOpen(false);
      }
      if (fontMenuRef.current && !fontMenuRef.current.contains(target)) {
        setFontMenuOpen(false);
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
        setStoreMenuOpen(false);
        setFontMenuOpen(false);
      }
    };

    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, []);

  useEffect(() => {
    if (!menuOpen && !cartOpen) {
      document.body.style.overflow = "";
      return;
    }

    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prev;
    };
  }, [menuOpen, cartOpen]);

  const groupedCategories = useMemo(() => {
    return {
      women: categories.filter((category) => category.gender === "women"),
      men: categories.filter((category) => category.gender === "men"),
      kids: categories.filter((category) => category.gender === "kids")
    };
  }, [categories]);

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

                    <div>
                      <Link href="/catalog/women" onClick={() => setMenuOpen(false)} className="mb-2 block">
                        Женское
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
                        Мужское
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
                        Детское
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
                    <Link href="/admin" onClick={() => setMenuOpen(false)} className="block">
                      Админка
                    </Link>
                  </div>

                  <div className="border-t border-border pt-6">
                    <p className="mb-4 text-xs uppercase tracking-[0.08em] text-text-muted">Выбор магазина</p>
                    <div className="space-y-3 text-sm">
                      {stores.map((store) => (
                        <button
                          key={store.id}
                          type="button"
                          onClick={() => {
                            setSelectedStoreId(store.id);
                            setMenuOpen(false);
                          }}
                          className={`flex w-full items-center justify-between border px-3 py-2 text-left ${
                            selectedStore.id === store.id
                              ? "border-text-primary bg-text-primary text-white"
                              : "border-border"
                          }`}
                        >
                          <span>
                            {store.name}, {store.city}
                          </span>
                          {selectedStore.id === store.id && <Check size={14} />}
                        </button>
                      ))}
                    </div>
                  </div>
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
                          <p className="mt-1 text-sm">{formatPrice(item.price)} × {item.quantity}</p>
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
            <button
              className="inline-flex items-center gap-2 text-sm uppercase tracking-[0.08em]"
              onClick={() => setMenuOpen(true)}
              type="button"
              aria-label="Открыть меню"
            >
              <Menu size={20} />
              <span className="hidden md:inline">Магазин</span>
            </button>

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
                    setFontMenuOpen(false);
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

              <div ref={fontMenuRef} className="relative hidden md:block">
                <button
                  type="button"
                  onClick={() => {
                    setFontMenuOpen((value) => !value);
                    setStoreMenuOpen(false);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-md border border-border px-2.5 py-1.5 text-[11px] uppercase tracking-[0.08em] text-text-secondary"
                  aria-label="Выбор шрифта"
                >
                  Шрифт
                  <span className="hidden lg:inline text-text-muted">· {FONT_BUTTON_LABELS[theme]}</span>
                  <ChevronDown size={13} className={fontMenuOpen ? "rotate-180 transition" : "transition"} />
                </button>

                <AnimatePresence>
                  {fontMenuOpen && (
                    <motion.div
                      className="absolute right-0 top-[calc(100%+6px)] z-30 min-w-[260px] rounded-md border border-border bg-white p-1 shadow-lg"
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.15 }}
                    >
                      {fontOptions.map((option) => {
                        const active = theme === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => {
                              setTheme(option.value as FontTheme);
                              setFontMenuOpen(false);
                            }}
                            className={`flex w-full items-center justify-between rounded px-3 py-2 text-left text-xs uppercase tracking-[0.08em] ${
                              active ? "bg-text-primary text-white" : "hover:bg-bg-secondary"
                            }`}
                          >
                            <span>{option.label}</span>
                            {active && <Check size={13} />}
                          </button>
                        );
                      })}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <button className="text-text-primary" type="button" aria-label="Поиск">
                <Search size={20} />
              </button>
              <button className="hidden text-text-primary md:inline" type="button" aria-label="Избранное">
                <Heart size={20} />
              </button>
              <button
                className="relative text-text-primary"
                type="button"
                aria-label="Корзина"
                onClick={() => setCartOpen(true)}
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

          <div className="border-t border-border py-2 text-sm">
            <nav className={`hidden items-center justify-end gap-6 md:flex ${compact ? "opacity-0" : "opacity-100"}`}>
              {NAV_ITEMS.map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`border-b pb-1 text-[13px] uppercase tracking-[0.1em] transition ${
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
        </Container>
      </header>
      {overlays}
    </>
  );
}

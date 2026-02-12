"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { useEffect } from "react";

export interface FavoriteItem {
  productId: string;
  slug: string;
  name: string;
  brand: string;
  price: number;
  imageUrl: string;
}

interface FavoritesContextValue {
  items: FavoriteItem[];
  totalItems: number;
  isFavorite: (productId: string) => boolean;
  toggleItem: (item: FavoriteItem) => void;
  removeItem: (productId: string) => void;
  clear: () => void;
}

const FavoritesContext = createContext<FavoritesContextValue | null>(null);
const FAVORITES_KEY = "mia-favorites-v1";

function readFromStorage(): FavoriteItem[] {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const raw = localStorage.getItem(FAVORITES_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as FavoriteItem[];
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item) =>
        item &&
        typeof item.productId === "string" &&
        typeof item.slug === "string" &&
        typeof item.name === "string" &&
        typeof item.brand === "string" &&
        typeof item.price === "number" &&
        typeof item.imageUrl === "string"
    );
  } catch {
    return [];
  }
}

interface FavoritesProviderProps {
  children: ReactNode;
}

export function FavoritesProvider({ children }: FavoritesProviderProps) {
  const [items, setItems] = useState<FavoriteItem[]>([]);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setItems(readFromStorage());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) {
      return;
    }

    localStorage.setItem(FAVORITES_KEY, JSON.stringify(items));
  }, [items, hydrated]);

  const isFavorite = useCallback((productId: string): boolean => {
    return items.some((item) => item.productId === productId);
  }, [items]);

  const toggleItem = useCallback((item: FavoriteItem) => {
    setItems((current) => {
      if (current.some((entry) => entry.productId === item.productId)) {
        return current.filter((entry) => entry.productId !== item.productId);
      }

      return [item, ...current];
    });
  }, []);

  const removeItem = useCallback((productId: string) => {
    setItems((current) => current.filter((item) => item.productId !== productId));
  }, []);

  const clear = useCallback(() => {
    setItems([]);
  }, []);

  const value = useMemo(
    () => ({
      items,
      totalItems: items.length,
      isFavorite,
      toggleItem,
      removeItem,
      clear
    }),
    [items, isFavorite, toggleItem, removeItem, clear]
  );

  return <FavoritesContext.Provider value={value}>{children}</FavoritesContext.Provider>;
}

export function useFavorites() {
  const context = useContext(FavoritesContext);

  if (!context) {
    throw new Error("useFavorites must be used inside FavoritesProvider");
  }

  return context;
}

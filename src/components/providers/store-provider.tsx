"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { Store } from "@/lib/types";

interface StoreContextValue {
  stores: Store[];
  selectedStoreId: string;
  selectedStore: Store;
  setSelectedStoreId: (id: string) => void;
}

const StoreContext = createContext<StoreContextValue | null>(null);

const STORE_KEY = "mia-selected-store";
const STORE_COOKIE = "mia_store";

interface StoreProviderProps {
  stores: Store[];
  initialStoreId: string;
  children: ReactNode;
}

export function StoreProvider({
  stores,
  initialStoreId,
  children
}: StoreProviderProps) {
  const fallbackId = stores[0]?.id ?? "";
  const [selectedStoreId, setSelectedStoreIdState] = useState(initialStoreId || fallbackId);

  useEffect(() => {
    const saved = localStorage.getItem(STORE_KEY);

    if (saved && stores.some((store) => store.id === saved)) {
      setSelectedStoreIdState(saved);
    }
  }, [stores]);

  const setSelectedStoreId = useCallback((id: string) => {
    setSelectedStoreIdState(id);
    localStorage.setItem(STORE_KEY, id);
    document.cookie = `${STORE_COOKIE}=${id}; path=/; max-age=31536000; samesite=lax`;
  }, []);

  const selectedStore =
    stores.find((store) => store.id === selectedStoreId) ?? stores[0];

  const value = useMemo(
    () => ({
      stores,
      selectedStoreId: selectedStore?.id ?? fallbackId,
      selectedStore,
      setSelectedStoreId
    }),
    [stores, fallbackId, selectedStore, setSelectedStoreId]
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const context = useContext(StoreContext);

  if (!context) {
    throw new Error("useStore must be used inside StoreProvider");
  }

  return context;
}

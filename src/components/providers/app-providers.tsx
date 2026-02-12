"use client";

import type { ReactNode } from "react";
import type { Store } from "@/lib/types";
import { CartProvider, useCart } from "@/components/providers/cart-provider";
import { FavoritesProvider } from "@/components/providers/favorites-provider";
import { FontThemeProvider } from "@/components/providers/font-theme-provider";
import { StoreProvider } from "@/components/providers/store-provider";

interface AppProvidersProps {
  stores: Store[];
  initialStoreId: string;
  children: ReactNode;
}

function CartToast() {
  const { toastMessage } = useCart();

  if (!toastMessage) {
    return null;
  }

  return (
    <div className="fixed right-4 top-4 z-[70] rounded-md border border-border bg-white px-4 py-3 text-sm text-text-primary shadow-lg">
      {toastMessage}
    </div>
  );
}

export function AppProviders({ stores, initialStoreId, children }: AppProvidersProps) {
  return (
    <FontThemeProvider>
      <StoreProvider stores={stores} initialStoreId={initialStoreId}>
        <FavoritesProvider>
          <CartProvider>
            {children}
            <CartToast />
          </CartProvider>
        </FavoritesProvider>
      </StoreProvider>
    </FontThemeProvider>
  );
}

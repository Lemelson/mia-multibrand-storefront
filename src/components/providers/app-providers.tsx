"use client";

import type { ReactNode } from "react";
import type { Store } from "@/lib/types";
import { CartProvider, useCart } from "@/components/providers/cart-provider";
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
    <StoreProvider stores={stores} initialStoreId={initialStoreId}>
      <CartProvider>
        {children}
        <CartToast />
      </CartProvider>
    </StoreProvider>
  );
}

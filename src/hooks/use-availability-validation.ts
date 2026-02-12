import { useEffect, useState } from "react";
import type { Product } from "@/lib/types";

export interface AvailabilityIssue {
  key: string;
  name: string;
  reason: string;
}

interface CartItemLike {
  key: string;
  productId: string;
  name: string;
  colorId: string;
  colorName: string;
  size: string;
}

interface StoreLike {
  id: string;
  name: string;
}

export function useAvailabilityValidation(
  items: CartItemLike[],
  selectedStore: StoreLike
) {
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityIssues, setAvailabilityIssues] = useState<AvailabilityIssue[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function validateAvailability() {
      if (items.length === 0) {
        setAvailabilityIssues([]);
        return;
      }

      setAvailabilityLoading(true);

      const uniqueProductIds = Array.from(new Set(items.map((item) => item.productId)));
      const results = await Promise.all(
        uniqueProductIds.map(async (id) => {
          const response = await fetch(`/api/products/${id}`, { cache: "no-store" });
          if (!response.ok) {
            return { id, product: null as Product | null };
          }

          const product = (await response.json()) as Product;
          return { id, product };
        })
      );

      const productMap = new Map(results.map((entry) => [entry.id, entry.product]));
      const nextIssues: AvailabilityIssue[] = [];

      for (const item of items) {
        const product = productMap.get(item.productId);

        if (!product) {
          nextIssues.push({
            key: item.key,
            name: item.name,
            reason: "товар не найден"
          });
          continue;
        }

        const inStore = product.stores.some(
          (store) => store.storeId === selectedStore.id && store.available
        );

        if (!inStore) {
          nextIssues.push({
            key: item.key,
            name: item.name,
            reason: `нет в магазине ${selectedStore.name}`
          });
          continue;
        }

        const color =
          product.colors.find((value) => value.id === item.colorId) ??
          product.colors.find((value) => value.name === item.colorName);

        if (!color) {
          nextIssues.push({
            key: item.key,
            name: item.name,
            reason: `цвет ${item.colorName} недоступен`
          });
          continue;
        }

        const size = color.sizes.find((value) => value.size === item.size);

        if (!size || !size.inStock) {
          nextIssues.push({
            key: item.key,
            name: item.name,
            reason: `размер ${item.size} недоступен`
          });
        }
      }

      if (!cancelled) {
        setAvailabilityIssues(nextIssues);
        setAvailabilityLoading(false);
      }
    }

    validateAvailability();

    return () => {
      cancelled = true;
    };
  }, [items, selectedStore.id, selectedStore.name]);

  return { availabilityIssues, availabilityLoading };
}

"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import type { CartItem } from "@/lib/types";

interface CartContextValue {
  items: CartItem[];
  totalItems: number;
  totalAmount: number;
  toastMessage: string | null;
  addItem: (item: Omit<CartItem, "quantity" | "key">) => void;
  removeItem: (key: string) => void;
  updateQuantity: (key: string, quantity: number) => void;
  clearCart: () => void;
  clearToast: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

const CART_KEY = "mia-cart";

interface CartProviderProps {
  children: ReactNode;
}

export function CartProvider({ children }: CartProviderProps) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    const raw = localStorage.getItem(CART_KEY);

    if (!raw) {
      return;
    }

    try {
      const parsed = JSON.parse(raw) as CartItem[];
      setItems(parsed);
    } catch {
      localStorage.removeItem(CART_KEY);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(items));
  }, [items]);

  useEffect(() => {
    if (!toastMessage) {
      return;
    }

    const timeout = window.setTimeout(() => {
      setToastMessage(null);
    }, 2000);

    return () => window.clearTimeout(timeout);
  }, [toastMessage]);

  const addItem: CartContextValue["addItem"] = (item) => {
    const key = `${item.productId}:${item.colorId}:${item.size}`;

    setItems((current) => {
      const index = current.findIndex((cartItem) => cartItem.key === key);

      if (index === -1) {
        return [{ ...item, key, quantity: 1 }, ...current];
      }

      const next = [...current];
      next[index] = {
        ...next[index],
        quantity: next[index].quantity + 1
      };
      return next;
    });

    setToastMessage("Товар добавлен в корзину");
  };

  const removeItem: CartContextValue["removeItem"] = (key) => {
    setItems((current) => current.filter((item) => item.key !== key));
  };

  const updateQuantity: CartContextValue["updateQuantity"] = (key, quantity) => {
    if (quantity < 1) {
      removeItem(key);
      return;
    }

    setItems((current) =>
      current.map((item) =>
        item.key === key
          ? {
              ...item,
              quantity
            }
          : item
      )
    );
  };

  const clearCart = () => setItems([]);
  const clearToast = () => setToastMessage(null);

  const totalItems = useMemo(
    () => items.reduce((sum, item) => sum + item.quantity, 0),
    [items]
  );
  const totalAmount = useMemo(
    () => items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    [items]
  );

  const value = {
    items,
    totalItems,
    totalAmount,
    toastMessage,
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
    clearToast
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart must be used inside CartProvider");
  }

  return context;
}

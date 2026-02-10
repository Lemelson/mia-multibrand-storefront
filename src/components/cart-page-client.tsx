"use client";

import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/components/providers/cart-provider";
import { formatPrice } from "@/lib/format";

export function CartPageClient() {
  const { items, totalItems, totalAmount, updateQuantity, removeItem } = useCart();

  if (items.length === 0) {
    return (
      <section className="py-16 text-center">
        <div className="mx-auto max-w-md border border-border bg-bg-secondary px-6 py-12">
          <p className="text-5xl">👜</p>
          <h1 className="mt-4 font-logo text-3xl">Ваша корзина пуста</h1>
          <p className="mt-3 text-sm text-text-secondary">Добавьте товары из каталога, чтобы оформить заказ.</p>
          <Link
            href="/catalog"
            className="mt-6 inline-block border border-text-primary px-6 py-3 text-xs uppercase tracking-[0.08em]"
          >
            Перейти в каталог
          </Link>
        </div>
      </section>
    );
  }

  return (
    <section className="py-6 md:py-8">
      <h1 className="font-logo text-3xl md:text-[42px]">Корзина ({totalItems})</h1>

      <div className="mt-8 grid gap-10 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {items.map((item) => (
            <article key={item.key} className="grid grid-cols-[80px_1fr] gap-4 border border-border p-4 md:grid-cols-[90px_1fr_auto]">
              <div className="relative h-24 w-20 overflow-hidden bg-bg-secondary md:h-[110px] md:w-[90px]">
                <Image
                  src={item.imageUrl}
                  alt={item.name}
                  fill
                  sizes="100px"
                  className="object-cover"
                />
              </div>

              <div>
                <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{item.brand}</p>
                <h2 className="mt-1 text-sm">{item.name}</h2>
                <p className="mt-1 text-xs text-text-secondary">
                  Цвет: {item.colorName} | Размер: {item.size}
                </p>
                <p className="mt-2 text-sm font-medium">{formatPrice(item.price)}</p>

                <div className="mt-3 inline-flex items-center border border-border">
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.key, item.quantity - 1)}
                    className="px-3 py-2 text-sm"
                  >
                    −
                  </button>
                  <span className="min-w-10 border-x border-border px-3 py-2 text-center text-sm">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => updateQuantity(item.key, item.quantity + 1)}
                    className="px-3 py-2 text-sm"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="col-span-2 flex items-start justify-between md:col-span-1 md:block md:text-right">
                <p className="text-sm font-medium">{formatPrice(item.price * item.quantity)}</p>
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  className="mt-2 text-xs text-text-secondary"
                >
                  Удалить
                </button>
              </div>
            </article>
          ))}

          <Link href="/catalog" className="inline-block text-sm text-text-secondary">
            Продолжить покупки →
          </Link>
        </div>

        <aside className="h-fit border border-border p-5">
          <h2 className="mb-5 text-sm uppercase tracking-[0.08em] text-text-muted">Итог</h2>
          <div className="flex items-center justify-between text-sm">
            <span>Товары ({totalItems})</span>
            <span>{formatPrice(totalAmount)}</span>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-base font-medium">
            <span>Итого</span>
            <span>{formatPrice(totalAmount)}</span>
          </div>

          <Link
            href="/checkout"
            className="mt-5 block bg-text-primary px-4 py-3 text-center text-xs uppercase tracking-[0.08em] text-white"
          >
            Оформить заказ
          </Link>
        </aside>
      </div>
    </section>
  );
}

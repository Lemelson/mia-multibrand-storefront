"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useCart } from "@/components/providers/cart-provider";
import { useStore } from "@/components/providers/store-provider";
import { formatPrice } from "@/lib/format";
import type { DeliveryType, Order, PaymentMethod, Product } from "@/lib/types";

interface AvailabilityIssue {
  key: string;
  name: string;
  reason: string;
}

function formatPhone(raw: string): string {
  const digits = raw.replace(/\D/g, "").slice(0, 11);
  const normalized = digits.startsWith("8") ? `7${digits.slice(1)}` : digits;

  const part1 = normalized.slice(1, 4);
  const part2 = normalized.slice(4, 7);
  const part3 = normalized.slice(7, 9);
  const part4 = normalized.slice(9, 11);

  let value = "+7";

  if (part1) {
    value += ` (${part1}`;
  }

  if (part1.length === 3) {
    value += ")";
  }

  if (part2) {
    value += ` ${part2}`;
  }

  if (part3) {
    value += `-${part3}`;
  }

  if (part4) {
    value += `-${part4}`;
  }

  return value;
}

export function CheckoutPageClient() {
  const router = useRouter();
  const { items, totalAmount, clearCart } = useCart();
  const { selectedStore, stores, setSelectedStoreId } = useStore();

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("+7");
  const [email, setEmail] = useState("");
  const [comment, setComment] = useState("");
  const [delivery, setDelivery] = useState<DeliveryType>("pickup");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("messenger");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState(false);
  const [availabilityIssues, setAvailabilityIssues] = useState<AvailabilityIssue[]>([]);

  const messengerText = useMemo(() => {
    const lines = items
      .map((item) => `• ${item.name} (${item.colorName}, ${item.size}) × ${item.quantity}`)
      .join("\n");

    return [
      "Здравствуйте! Хочу оплатить заказ в MIA.",
      `Магазин: ${selectedStore.name}, ${selectedStore.city}`,
      `Сумма: ${formatPrice(totalAmount)}`,
      "Товары:",
      lines
    ].join("\n");
  }, [items, selectedStore.name, selectedStore.city, totalAmount]);

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

  const canSubmit = !loading && !availabilityLoading && availabilityIssues.length === 0;

  if (items.length === 0) {
    return (
      <section className="py-16 text-center">
        <h1 className="font-logo text-3xl">Корзина пуста</h1>
        <p className="mt-3 text-sm text-text-secondary">Добавьте товары перед оформлением заказа.</p>
        <Link
          href="/catalog"
          className="mt-6 inline-block border border-text-primary px-6 py-3 text-xs uppercase tracking-[0.08em]"
        >
          В каталог
        </Link>
      </section>
    );
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!name.trim() || phone.replace(/\D/g, "").length < 11) {
      setError("Заполните имя и корректный телефон");
      return;
    }

    if (availabilityIssues.length > 0) {
      setError("В выбранном магазине часть товаров недоступна. Измените магазин или корзину.");
      return;
    }

    setLoading(true);

    const payload: Partial<Order> = {
      customer: {
        name: name.trim(),
        phone,
        email: email.trim() || undefined,
        comment: comment.trim() || undefined
      },
      delivery,
      paymentMethod,
      storeId: selectedStore.id,
      items: items.map((item) => ({
        productId: item.productId,
        name: item.name,
        brand: item.brand,
        color: item.colorName,
        size: item.size,
        price: item.price,
        quantity: item.quantity,
        imageUrl: item.imageUrl
      }))
    };

    const response = await fetch("/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      setError("Не удалось оформить заказ. Попробуйте снова.");
      setLoading(false);
      return;
    }

    const order = (await response.json()) as Order;
    clearCart();

    const params = new URLSearchParams({
      orderNumber: order.orderNumber,
      delivery: order.delivery,
      payment: order.paymentMethod,
      total: String(order.totalAmount),
      messenger: messengerText
    });

    router.push(`/checkout/success?${params.toString()}`);
  }

  return (
    <section className="py-6 md:py-8">
      <h1 className="font-logo text-3xl md:text-[42px]">Оформление заказа</h1>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_360px]">
        <form onSubmit={handleSubmit} className="space-y-6 border border-border p-5 md:p-6">
          <fieldset className="space-y-4">
            <legend className="mb-1 text-sm uppercase tracking-[0.08em] text-text-muted">Контактные данные</legend>

            <label className="block text-sm">
              Имя *
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="mt-2 w-full border border-border px-3 py-3"
                required
              />
            </label>

            <label className="block text-sm">
              Телефон *
              <input
                value={phone}
                onChange={(event) => setPhone(formatPhone(event.target.value))}
                className="mt-2 w-full border border-border px-3 py-3"
                required
              />
            </label>

            <label className="block text-sm">
              E-mail
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="mt-2 w-full border border-border px-3 py-3"
              />
            </label>

            <label className="block text-sm">
              Комментарий к заказу
              <textarea
                value={comment}
                onChange={(event) => setComment(event.target.value)}
                className="mt-2 min-h-[120px] w-full border border-border px-3 py-3"
              />
            </label>
          </fieldset>

          <fieldset className="border-t border-border pt-5">
            <legend className="mb-3 text-sm uppercase tracking-[0.08em] text-text-muted">Магазин и получение</legend>

            <label className="mb-4 block text-sm">
              Магазин
              <select
                value={selectedStore.id}
                onChange={(event) => setSelectedStoreId(event.target.value)}
                className="mt-2 w-full border border-border bg-white px-3 py-3"
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}, {store.city}
                  </option>
                ))}
              </select>
            </label>

            <div className="space-y-3">
              <ChoiceCard
                checked={delivery === "pickup"}
                onSelect={() => setDelivery("pickup")}
                title="Самовывоз из магазина"
                subtitle={selectedStore.address}
              />

              <ChoiceCard
                checked={delivery === "delivery"}
                onSelect={() => setDelivery("delivery")}
                title="Доставка (обсудить)"
                subtitle="Менеджер свяжется с вами для согласования доставки."
              />
            </div>

            {availabilityLoading && (
              <p className="mt-4 text-sm text-text-secondary">Проверяем наличие по выбранному магазину...</p>
            )}

            {availabilityIssues.length > 0 && (
              <div className="mt-4 border border-error/40 bg-error/10 p-3 text-sm text-error">
                <p className="font-medium">
                  {delivery === "pickup"
                    ? "Самовывоз из выбранного магазина недоступен для части товаров:"
                    : "Доставка из выбранного магазина недоступна для части товаров:"}
                </p>
                <ul className="mt-2 space-y-1 text-xs">
                  {availabilityIssues.map((issue) => (
                    <li key={issue.key}>• {issue.name}: {issue.reason}</li>
                  ))}
                </ul>
                <p className="mt-2 text-xs">Смените магазин или удалите недоступные позиции из корзины.</p>
              </div>
            )}
          </fieldset>

          <fieldset className="border-t border-border pt-5">
            <legend className="mb-3 text-sm uppercase tracking-[0.08em] text-text-muted">Оплата</legend>
            <div className="space-y-3">
              <ChoiceCard
                checked={false}
                disabled
                onSelect={() => undefined}
                title="Оплата картой"
                subtitle="Временно недоступно"
              />

              <ChoiceCard
                checked={paymentMethod === "messenger"}
                onSelect={() => setPaymentMethod("messenger")}
                title="Связаться для оплаты"
                subtitle="Менеджер в WhatsApp / Telegram"
              />

              <ChoiceCard
                checked={paymentMethod === "cash"}
                onSelect={() => setPaymentMethod("cash")}
                title="Оплата при получении"
              />
            </div>

            {paymentMethod === "messenger" && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(messengerText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-border px-3 py-3 text-center text-xs uppercase tracking-[0.08em]"
                >
                  Открыть WhatsApp
                </a>
                <a
                  href={`https://t.me/share/url?url=${encodeURIComponent("https://mia.local")}&text=${encodeURIComponent(messengerText)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-border px-3 py-3 text-center text-xs uppercase tracking-[0.08em]"
                >
                  Открыть Telegram
                </a>
              </div>
            )}
          </fieldset>

          {error && <p className="text-sm text-error">{error}</p>}

          <button
            type="submit"
            disabled={!canSubmit}
            className="w-full bg-text-primary px-4 py-4 text-xs uppercase tracking-[0.08em] text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Подтверждаем..." : "Подтвердить заказ"}
          </button>
        </form>

        <aside className="h-fit border border-border p-5 md:p-6">
          <h2 className="mb-4 text-sm uppercase tracking-[0.08em] text-text-muted">Ваш заказ</h2>
          <div className="space-y-4">
            {items.map((item) => (
              <article key={item.key} className="grid grid-cols-[64px_1fr] gap-3 border-b border-border pb-3">
                <div className="relative h-20 w-16 overflow-hidden bg-bg-secondary">
                  <Image src={item.imageUrl} alt={item.name} fill sizes="64px" className="object-cover" />
                </div>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{item.brand}</p>
                  <p className="line-clamp-2 text-sm">{item.name}</p>
                  <p className="text-xs text-text-secondary">
                    {item.colorName} · {item.size}
                  </p>
                  <p className="mt-1 text-sm">{formatPrice(item.price)} × {item.quantity}</p>
                </div>
              </article>
            ))}
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-border pt-4 text-base font-medium">
            <span>Итого</span>
            <span>{formatPrice(totalAmount)}</span>
          </div>
        </aside>
      </div>
    </section>
  );
}

interface ChoiceCardProps {
  checked: boolean;
  disabled?: boolean;
  onSelect: () => void;
  title: string;
  subtitle?: string;
}

function ChoiceCard({ checked, disabled = false, onSelect, title, subtitle }: ChoiceCardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      role="radio"
      aria-checked={checked}
      className={`flex w-full items-start gap-3 border px-3 py-3 text-left text-sm transition ${
        disabled
          ? "cursor-not-allowed border-border text-text-muted opacity-60"
          : checked
            ? "border-text-primary bg-bg-secondary"
            : "border-border hover:border-text-primary"
      }`}
    >
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center border ${
          checked ? "border-text-primary bg-text-primary text-white" : "border-border bg-white"
        }`}
      >
        {checked && <Check size={13} />}
      </span>
      <span>
        <span className="block text-sm text-text-primary">{title}</span>
        {subtitle && <span className="mt-1 block text-xs text-text-secondary">{subtitle}</span>}
      </span>
    </button>
  );
}

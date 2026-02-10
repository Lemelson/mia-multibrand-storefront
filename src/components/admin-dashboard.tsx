"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { formatDate, formatPrice, slugify } from "@/lib/format";
import type {
  Category,
  Gender,
  Order,
  OrderStatus,
  Product,
  ProductColor,
  ProductSize,
  Store
} from "@/lib/types";

interface AdminDashboardProps {
  initialProducts: Product[];
  initialOrders: Order[];
  stores: Store[];
  categories: Category[];
}

type Tab = "products" | "orders";

interface ProductFormState {
  name: string;
  brand: string;
  slug: string;
  gender: Gender;
  category: string;
  price: string;
  oldPrice: string;
  description: string;
  composition: string;
  care: string;
  colorName: string;
  colorHex: string;
  images: string;
  sizes: string;
  storeIds: string[];
  isNew: boolean;
  isActive: boolean;
}

const EMPTY_FORM: ProductFormState = {
  name: "",
  brand: "",
  slug: "",
  gender: "women",
  category: "dresses",
  price: "",
  oldPrice: "",
  description: "",
  composition: "",
  care: "",
  colorName: "Базовый",
  colorHex: "#D4B896",
  images: "",
  sizes: "XS:1,S:1,M:1,L:0,XL:0",
  storeIds: [],
  isNew: true,
  isActive: true
};

export function AdminDashboard({
  initialProducts,
  initialOrders,
  stores,
  categories
}: AdminDashboardProps) {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("products");
  const [products, setProducts] = useState(initialProducts);
  const [orders, setOrders] = useState(initialOrders);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [form, setForm] = useState<ProductFormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const categoriesByGender = useMemo(() => {
    return {
      women: categories.filter((item) => item.gender === "women"),
      men: categories.filter((item) => item.gender === "men"),
      kids: categories.filter((item) => item.gender === "kids")
    };
  }, [categories]);

  const genderCategories = categoriesByGender[form.gender];

  function resetForm() {
    setEditingProductId(null);
    setForm(EMPTY_FORM);
  }

  function parseImages(value: string): string[] {
    return value
      .split(/\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function parseSizes(value: string): ProductSize[] {
    return value
      .split(",")
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const [size, stock] = entry.split(":").map((part) => part.trim());
        return {
          size,
          inStock: stock !== "0"
        } satisfies ProductSize;
      });
  }

  function formToPayload() {
    const now = new Date().toISOString();
    const images = parseImages(form.images);
    const sizes = parseSizes(form.sizes);

    const color: ProductColor = {
      id: editingProductId ? `${editingProductId}-color` : crypto.randomUUID(),
      name: form.colorName,
      hex: form.colorHex,
      images: images.length > 0 ? images : ["https://picsum.photos/600/800"],
      sizes: sizes.length > 0 ? sizes : [{ size: "ONE", inStock: true }]
    };

    return {
      name: form.name,
      brand: form.brand,
      slug: form.slug || slugify(form.name),
      category: form.category,
      gender: form.gender,
      price: Number(form.price),
      oldPrice: form.oldPrice ? Number(form.oldPrice) : undefined,
      description: form.description,
      composition: form.composition,
      care: form.care,
      colors: [color],
      stores: stores.map((store) => ({
        storeId: store.id,
        available: form.storeIds.includes(store.id)
      })),
      isNew: form.isNew,
      isActive: form.isActive,
      createdAt: now,
      updatedAt: now
    } satisfies Partial<Product>;
  }

  function fillFromProduct(product: Product) {
    const color = product.colors[0];
    const sizes = color?.sizes.map((size) => `${size.size}:${size.inStock ? "1" : "0"}`).join(",") ?? "";
    const images = color?.images.join("\n") ?? "";

    setEditingProductId(product.id);
    setForm({
      name: product.name,
      brand: product.brand,
      slug: product.slug,
      gender: product.gender,
      category: product.category,
      price: String(product.price),
      oldPrice: product.oldPrice ? String(product.oldPrice) : "",
      description: product.description,
      composition: product.composition,
      care: product.care,
      colorName: color?.name ?? "Базовый",
      colorHex: color?.hex ?? "#D4B896",
      images,
      sizes,
      storeIds: product.stores.filter((store) => store.available).map((store) => store.storeId),
      isNew: product.isNew,
      isActive: product.isActive
    });
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    if (!form.name.trim() || !form.brand.trim() || !form.price) {
      setMessage("Заполните обязательные поля товара");
      return;
    }

    setSubmitting(true);

    const payload = formToPayload();
    const response = await fetch(
      editingProductId ? `/api/products/${editingProductId}` : "/api/products",
      {
        method: editingProductId ? "PATCH" : "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      }
    );

    if (!response.ok) {
      setMessage("Не удалось сохранить товар");
      setSubmitting(false);
      return;
    }

    const product = (await response.json()) as Product;

    setProducts((current) => {
      if (!editingProductId) {
        return [product, ...current];
      }

      return current.map((item) => (item.id === product.id ? product : item));
    });

    setMessage(editingProductId ? "Товар обновлен" : "Товар добавлен");
    setSubmitting(false);
    resetForm();
  }

  async function toggleActive(product: Product) {
    const response = await fetch(`/api/products/${product.id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ isActive: !product.isActive })
    });

    if (!response.ok) {
      setMessage("Не удалось обновить статус товара");
      return;
    }

    const updated = (await response.json()) as Product;
    setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));
  }

  async function removeProduct(id: string) {
    const approve = window.confirm("Удалить товар?");

    if (!approve) {
      return;
    }

    const response = await fetch(`/api/products/${id}`, { method: "DELETE" });

    if (!response.ok) {
      setMessage("Не удалось удалить товар");
      return;
    }

    setProducts((current) => current.filter((item) => item.id !== id));
  }

  async function updateOrderStatus(orderId: string, status: OrderStatus) {
    const response = await fetch(`/api/orders/${orderId}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ status })
    });

    if (!response.ok) {
      setMessage("Не удалось обновить статус заказа");
      return;
    }

    const updated = (await response.json()) as Order;
    setOrders((current) => current.map((item) => (item.id === orderId ? updated : item)));
  }

  async function handleLogout() {
    await fetch("/api/admin/logout", { method: "POST" });
    router.push("/admin");
    router.refresh();
  }

  return (
    <div className="space-y-6 py-6 md:py-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="font-logo text-3xl md:text-[42px]">Админ-панель</h1>
        <button
          type="button"
          className="border border-border px-4 py-2 text-xs uppercase tracking-[0.08em]"
          onClick={handleLogout}
        >
          Выйти
        </button>
      </div>

      <div className="flex gap-3 border-b border-border pb-3">
        <button
          type="button"
          className={`px-3 py-2 text-xs uppercase tracking-[0.08em] ${tab === "products" ? "bg-text-primary text-white" : "border border-border"}`}
          onClick={() => setTab("products")}
        >
          Товары ({products.length})
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-xs uppercase tracking-[0.08em] ${tab === "orders" ? "bg-text-primary text-white" : "border border-border"}`}
          onClick={() => setTab("orders")}
        >
          Заказы ({orders.length})
        </button>
      </div>

      {message && <p className="text-sm text-accent">{message}</p>}

      {tab === "products" && (
        <div className="grid gap-8 lg:grid-cols-[460px_1fr]">
          <form onSubmit={submitForm} className="space-y-3 border border-border p-5">
            <h2 className="font-logo text-2xl">{editingProductId ? "Редактировать товар" : "Новый товар"}</h2>

            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Название *"
              className="w-full border border-border px-3 py-2"
              required
            />
            <input
              value={form.brand}
              onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
              placeholder="Бренд *"
              className="w-full border border-border px-3 py-2"
              required
            />
            <input
              value={form.slug}
              onChange={(event) => setForm((current) => ({ ...current, slug: event.target.value }))}
              placeholder="Slug (опц.)"
              className="w-full border border-border px-3 py-2"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <select
                value={form.gender}
                onChange={(event) => {
                  const gender = event.target.value as Gender;
                  setForm((current) => ({
                    ...current,
                    gender,
                    category: categoriesByGender[gender][0]?.slug ?? ""
                  }));
                }}
                className="border border-border px-3 py-2"
              >
                <option value="women">Женское</option>
                <option value="men">Мужское</option>
                <option value="kids">Детское</option>
              </select>
              <select
                value={form.category}
                onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))}
                className="border border-border px-3 py-2"
              >
                {genderCategories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={form.price}
                onChange={(event) => setForm((current) => ({ ...current, price: event.target.value.replace(/\D/g, "") }))}
                placeholder="Цена *"
                className="border border-border px-3 py-2"
                required
              />
              <input
                value={form.oldPrice}
                onChange={(event) => setForm((current) => ({ ...current, oldPrice: event.target.value.replace(/\D/g, "") }))}
                placeholder="Старая цена"
                className="border border-border px-3 py-2"
              />
            </div>

            <textarea
              value={form.description}
              onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))}
              placeholder="Описание"
              className="min-h-[90px] w-full border border-border px-3 py-2"
            />
            <input
              value={form.composition}
              onChange={(event) => setForm((current) => ({ ...current, composition: event.target.value }))}
              placeholder="Состав"
              className="w-full border border-border px-3 py-2"
            />
            <input
              value={form.care}
              onChange={(event) => setForm((current) => ({ ...current, care: event.target.value }))}
              placeholder="Уход"
              className="w-full border border-border px-3 py-2"
            />

            <div className="grid gap-3 md:grid-cols-2">
              <input
                value={form.colorName}
                onChange={(event) => setForm((current) => ({ ...current, colorName: event.target.value }))}
                placeholder="Цвет"
                className="border border-border px-3 py-2"
              />
              <input
                value={form.colorHex}
                onChange={(event) => setForm((current) => ({ ...current, colorHex: event.target.value }))}
                placeholder="#HEX"
                className="border border-border px-3 py-2"
              />
            </div>

            <textarea
              value={form.images}
              onChange={(event) => setForm((current) => ({ ...current, images: event.target.value }))}
              placeholder="URL фото (каждый с новой строки или через запятую)"
              className="min-h-[80px] w-full border border-border px-3 py-2"
            />
            <input
              value={form.sizes}
              onChange={(event) => setForm((current) => ({ ...current, sizes: event.target.value }))}
              placeholder="Размеры: XS:1,S:1,M:0"
              className="w-full border border-border px-3 py-2"
            />

            <div>
              <p className="mb-2 text-xs uppercase tracking-[0.08em] text-text-muted">Магазины</p>
              <div className="space-y-2 text-sm">
                {stores.map((store) => (
                  <label key={store.id} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.storeIds.includes(store.id)}
                      onChange={() => {
                        setForm((current) => ({
                          ...current,
                          storeIds: current.storeIds.includes(store.id)
                            ? current.storeIds.filter((id) => id !== store.id)
                            : [...current.storeIds, store.id]
                        }));
                      }}
                    />
                    {store.name}
                  </label>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isNew}
                  onChange={(event) => setForm((current) => ({ ...current, isNew: event.target.checked }))}
                />
                NEW
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.isActive}
                  onChange={(event) => setForm((current) => ({ ...current, isActive: event.target.checked }))}
                />
                Активен
              </label>
            </div>

            <div className="flex flex-wrap gap-2 pt-2">
              <button
                type="submit"
                className="bg-text-primary px-4 py-3 text-xs uppercase tracking-[0.08em] text-white disabled:opacity-60"
                disabled={submitting}
              >
                {submitting ? "Сохранение..." : editingProductId ? "Обновить" : "Добавить"}
              </button>

              {editingProductId && (
                <button
                  type="button"
                  className="border border-border px-4 py-3 text-xs uppercase tracking-[0.08em]"
                  onClick={resetForm}
                >
                  Отмена
                </button>
              )}
            </div>
          </form>

          <div className="space-y-3">
            {products.map((product) => {
              const image = product.colors[0]?.images[0] ?? "https://picsum.photos/200/260";

              return (
                <article key={product.id} className="grid grid-cols-[72px_1fr] gap-4 border border-border p-3">
                  <div className="relative h-24 w-[72px] overflow-hidden bg-bg-secondary">
                    <Image src={image} alt={product.name} fill sizes="72px" className="object-cover" />
                  </div>

                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{product.brand}</p>
                        <h3 className="text-sm">{product.name}</h3>
                        <p className="mt-1 text-xs text-text-secondary">
                          {product.gender} · {product.category}
                        </p>
                        <p className="mt-1 text-sm font-medium">{formatPrice(product.price)}</p>
                      </div>
                      <span
                        className={`h-fit px-2 py-1 text-[10px] uppercase tracking-[0.08em] ${
                          product.isActive ? "bg-success/15 text-success" : "bg-error/15 text-error"
                        }`}
                      >
                        {product.isActive ? "В наличии" : "Скрыт"}
                      </span>
                    </div>

                    <p className="mt-2 text-xs text-text-secondary">
                      Магазины: {product.stores.filter((store) => store.available).length}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => fillFromProduct(product)}
                        className="border border-border px-2 py-1 text-[11px] uppercase tracking-[0.08em]"
                      >
                        Редактировать
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleActive(product)}
                        className="border border-border px-2 py-1 text-[11px] uppercase tracking-[0.08em]"
                      >
                        {product.isActive ? "Скрыть" : "Показать"}
                      </button>
                      <button
                        type="button"
                        onClick={() => removeProduct(product.id)}
                        className="border border-error px-2 py-1 text-[11px] uppercase tracking-[0.08em] text-error"
                      >
                        Удалить
                      </button>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-3">
          {orders.length === 0 && (
            <div className="border border-border bg-bg-secondary px-5 py-8 text-sm text-text-secondary">
              Заказов пока нет.
            </div>
          )}

          {orders.map((order) => (
            <article key={order.id} className="border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-medium">{order.orderNumber}</h3>
                  <p className="text-xs text-text-secondary">{formatDate(order.createdAt)}</p>
                </div>
                <select
                  value={order.status}
                  onChange={(event) => updateOrderStatus(order.id, event.target.value as OrderStatus)}
                  className="border border-border px-3 py-2 text-xs uppercase tracking-[0.08em]"
                >
                  <option value="new">Новый</option>
                  <option value="processing">В обработке</option>
                  <option value="completed">Завершен</option>
                  <option value="cancelled">Отменен</option>
                </select>
              </div>

              <p className="mt-3 text-sm">
                {order.customer.name} · {order.customer.phone}
              </p>
              <p className="text-sm text-text-secondary">
                {order.delivery === "pickup" ? "Самовывоз" : "Доставка"} · {order.paymentMethod}
              </p>

              <div className="mt-3 space-y-2 text-sm">
                {order.items.map((item, index) => (
                  <p key={`${item.productId}-${index}`}>
                    {item.name} ({item.color}, {item.size}) × {item.quantity}
                  </p>
                ))}
              </div>

              <p className="mt-4 text-sm font-medium">Итого: {formatPrice(order.totalAmount)}</p>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

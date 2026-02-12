"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createSizeDrafts } from "@/lib/admin-options";
import { slugify } from "@/lib/format";
import type {
  Category,
  Order,
  OrderStatus,
  Product,
  ProductColor,
  Store
} from "@/lib/types";
import { AdminOrderList } from "@/components/admin/admin-order-list";
import {
  AdminProductForm,
  createEmptyFormState,
  parseImages,
  toSizeRows,
  type ProductFormState
} from "@/components/admin/admin-product-form";
import { AdminProductList } from "@/components/admin/admin-product-list";

interface AdminDashboardProps {
  initialProducts: Product[];
  initialOrders: Order[];
  stores: Store[];
  categories: Category[];
}

type Tab = "products" | "hidden" | "orders";

const DEFAULT_COLOR_HEX = "#1f1f1f";

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
  const [form, setForm] = useState<ProductFormState>(() => createEmptyFormState());
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const activeProducts = useMemo(
    () => products.filter((item) => item.isActive),
    [products]
  );

  const hiddenProducts = useMemo(
    () => products.filter((item) => !item.isActive),
    [products]
  );

  const activeProductsCount = activeProducts.length;
  const hiddenProductsCount = hiddenProducts.length;

  async function getResponseMessage(response: Response, fallback: string): Promise<string> {
    try {
      const payload = (await response.json()) as { message?: string };
      if (payload?.message) {
        return payload.message;
      }
    } catch {
      // ignore parse issues and use fallback
    }

    return fallback;
  }

  function resetForm() {
    setEditingProductId(null);
    setForm(createEmptyFormState());
  }

  function formToPayload() {
    const now = new Date().toISOString();
    const images = parseImages(form.images);
    const sizes = toSizeRows(form.sizes);

    const color: ProductColor = {
      id: editingProductId ? `${editingProductId}-color` : crypto.randomUUID(),
      name: form.colorName,
      hex: form.colorHex,
      images: images.length > 0 ? images : ["https://picsum.photos/600/800"],
      sizes: sizes.length > 0 ? sizes : [{ size: "U", inStock: true, quantity: 1 }]
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
      colorName: color?.name ?? "Черный",
      colorHex: color?.hex ?? DEFAULT_COLOR_HEX,
      images,
      sizes: createSizeDrafts(product.gender, product.category, color?.sizes ?? []),
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
      setMessage(await getResponseMessage(response, "Не удалось сохранить товар"));
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
      setMessage(await getResponseMessage(response, "Не удалось обновить статус товара"));
      return;
    }

    const updated = (await response.json()) as Product;
    setProducts((current) => current.map((item) => (item.id === updated.id ? updated : item)));

    if (updated.isActive && tab === "hidden") {
      setMessage("Товар возвращен в каталог");
    } else if (!updated.isActive && tab === "products") {
      setMessage("Товар скрыт");
    }
  }

  async function removeProduct(id: string) {
    const approve = window.confirm("Удалить товар?");

    if (!approve) {
      return;
    }

    const response = await fetch(`/api/products/${id}`, { method: "DELETE" });

    if (!response.ok) {
      setMessage(await getResponseMessage(response, "Не удалось удалить товар"));
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
      setMessage(await getResponseMessage(response, "Не удалось обновить статус заказа"));
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
          Товары ({activeProductsCount})
        </button>
        <button
          type="button"
          className={`px-3 py-2 text-xs uppercase tracking-[0.08em] ${tab === "hidden" ? "bg-text-primary text-white" : "border border-border"}`}
          onClick={() => setTab("hidden")}
        >
          Скрытые ({hiddenProductsCount})
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

      {(tab === "products" || tab === "hidden") && (
        <div className="grid gap-8 lg:grid-cols-[460px_1fr]">
          <AdminProductForm
            stores={stores}
            categories={categories}
            editingProductId={editingProductId}
            form={form}
            setForm={setForm}
            onSubmit={submitForm}
            onCancel={resetForm}
            submitting={submitting}
          />

          <AdminProductList
            products={tab === "products" ? activeProducts : hiddenProducts}
            categories={categories}
            mode={tab === "products" ? "active" : "hidden"}
            onEdit={fillFromProduct}
            onToggleActive={toggleActive}
            onDelete={removeProduct}
          />
        </div>
      )}

      {tab === "orders" && (
        <AdminOrderList
          orders={orders}
          onUpdateStatus={updateOrderStatus}
        />
      )}
    </div>
  );
}

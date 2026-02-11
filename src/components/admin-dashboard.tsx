"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { createSizeDrafts, ADMIN_BRAND_OPTIONS, ADMIN_COLOR_OPTIONS, type AdminSizeDraft } from "@/lib/admin-options";
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

type Tab = "products" | "hidden" | "orders";
type ProductFilterGender = Gender | "all";

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
  sizes: AdminSizeDraft[];
  storeIds: string[];
  isNew: boolean;
  isActive: boolean;
}

const DEFAULT_COLOR = ADMIN_COLOR_OPTIONS[0];

function toSizeRows(sizes: AdminSizeDraft[]): ProductSize[] {
  const rows: ProductSize[] = [];

  for (const item of sizes) {
    const normalizedSize = item.size.trim();
    if (!normalizedSize) {
      continue;
    }

    const quantityText = item.quantity.trim();
    const quantityNumber = quantityText === "" ? undefined : Number(quantityText);
    const quantity =
      typeof quantityNumber === "number" && Number.isFinite(quantityNumber) && quantityNumber >= 0
        ? Math.floor(quantityNumber)
        : undefined;

    const inStock = quantity !== undefined ? quantity > 0 : item.inStock;

    if (!item.inStock && quantity === undefined) {
      continue;
    }

    rows.push({
      size: normalizedSize,
      inStock,
      quantity
    });
  }

  return rows;
}

function createEmptyFormState(gender: Gender = "women", category = "dresses"): ProductFormState {
  return {
    name: "",
    brand: ADMIN_BRAND_OPTIONS[0],
    slug: "",
    gender,
    category,
    price: "",
    oldPrice: "",
    description: "",
    composition: "",
    care: "",
    colorName: DEFAULT_COLOR.name,
    colorHex: DEFAULT_COLOR.hex,
    images: "",
    sizes: createSizeDrafts(gender, category),
    storeIds: [],
    isNew: true,
    isActive: true
  };
}

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
  const [productFilterGender, setProductFilterGender] = useState<ProductFilterGender>("all");
  const [productFilterCategory, setProductFilterCategory] = useState<string>("all");
  const [productSearch, setProductSearch] = useState("");

  const categoriesByGender = useMemo(() => {
    return {
      women: categories.filter((item) => item.gender === "women"),
      men: categories.filter((item) => item.gender === "men"),
      kids: categories.filter((item) => item.gender === "kids")
    };
  }, [categories]);

  const genderCategories = categoriesByGender[form.gender];

  const availableFilterCategories = useMemo(() => {
    if (productFilterGender === "all") {
      return categories;
    }

    return categoriesByGender[productFilterGender];
  }, [categories, categoriesByGender, productFilterGender]);

  const filteredProducts = useMemo(() => {
    const query = productSearch.trim().toLowerCase();

    return products.filter((product) => {
      const byGender = productFilterGender === "all" || product.gender === productFilterGender;
      const byCategory = productFilterCategory === "all" || product.category === productFilterCategory;
      const bySearch =
        !query ||
        product.name.toLowerCase().includes(query) ||
        product.brand.toLowerCase().includes(query) ||
        product.slug.toLowerCase().includes(query) ||
        (product.sku ?? "").toLowerCase().includes(query);

      return byGender && byCategory && bySearch;
    });
  }, [products, productFilterGender, productFilterCategory, productSearch]);

  const activeProducts = useMemo(
    () => filteredProducts.filter((item) => item.isActive),
    [filteredProducts]
  );

  const hiddenProducts = useMemo(
    () => filteredProducts.filter((item) => !item.isActive),
    [filteredProducts]
  );

  const activeProductsCount = useMemo(
    () => products.filter((item) => item.isActive).length,
    [products]
  );

  const hiddenProductsCount = useMemo(
    () => products.filter((item) => !item.isActive).length,
    [products]
  );

  const brandOptions = useMemo(() => {
    if (form.brand && !ADMIN_BRAND_OPTIONS.includes(form.brand as (typeof ADMIN_BRAND_OPTIONS)[number])) {
      return [...ADMIN_BRAND_OPTIONS, form.brand];
    }

    return [...ADMIN_BRAND_OPTIONS];
  }, [form.brand]);

  const colorOptions = useMemo(() => {
    if (
      form.colorName &&
      !ADMIN_COLOR_OPTIONS.some(
        (item) => item.name.toLowerCase() === form.colorName.toLowerCase() && item.hex === form.colorHex
      )
    ) {
      return [...ADMIN_COLOR_OPTIONS, { name: form.colorName, hex: form.colorHex }];
    }

    return ADMIN_COLOR_OPTIONS;
  }, [form.colorHex, form.colorName]);

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

  function parseImages(value: string): string[] {
    return value
      .split(/\n|,/)
      .map((entry) => entry.trim())
      .filter(Boolean);
  }

  function applySizeTemplate(gender: Gender, category: string) {
    setForm((current) => ({
      ...current,
      sizes: createSizeDrafts(gender, category, toSizeRows(current.sizes))
    }));
  }

  function updateSizeRow(index: number, patch: Partial<AdminSizeDraft>) {
    setForm((current) => ({
      ...current,
      sizes: current.sizes.map((row, rowIndex) => (rowIndex === index ? { ...row, ...patch } : row))
    }));
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
      colorName: color?.name ?? DEFAULT_COLOR.name,
      colorHex: color?.hex ?? DEFAULT_COLOR.hex,
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

  function renderProductList(items: Product[], mode: "active" | "hidden") {
    if (items.length === 0) {
      return (
        <div className="border border-border bg-bg-secondary px-5 py-8 text-sm text-text-secondary">
          {mode === "active"
            ? "Активных товаров по текущему фильтру нет."
            : "Скрытых товаров по текущему фильтру нет."}
        </div>
      );
    }

    return items.map((product) => {
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
                {product.isActive ? "В каталоге" : "Скрыт"}
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
                {mode === "active" ? "Скрыть" : "Вернуть"}
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
    });
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
          <form onSubmit={submitForm} className="space-y-3 border border-border p-5">
            <h2 className="font-logo text-2xl">{editingProductId ? "Редактировать товар" : "Новый товар"}</h2>

            <input
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="Название *"
              className="w-full border border-border px-3 py-2"
              required
            />

            <select
              value={form.brand}
              onChange={(event) => setForm((current) => ({ ...current, brand: event.target.value }))}
              className="w-full border border-border px-3 py-2"
            >
              {brandOptions.map((brand) => (
                <option key={brand} value={brand}>
                  {brand}
                </option>
              ))}
            </select>

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
                  const nextCategory = categoriesByGender[gender][0]?.slug ?? "";
                  setForm((current) => ({
                    ...current,
                    gender,
                    category: nextCategory,
                    sizes: createSizeDrafts(gender, nextCategory, toSizeRows(current.sizes))
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
                onChange={(event) => {
                  const category = event.target.value;
                  setForm((current) => ({
                    ...current,
                    category,
                    sizes: createSizeDrafts(current.gender, category, toSizeRows(current.sizes))
                  }));
                }}
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
                onChange={(event) =>
                  setForm((current) => ({ ...current, oldPrice: event.target.value.replace(/\D/g, "") }))
                }
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

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-[0.08em] text-text-muted">Цвет</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {colorOptions.map((option) => {
                  const selected = form.colorName === option.name && form.colorHex.toLowerCase() === option.hex.toLowerCase();

                  return (
                    <button
                      key={`${option.name}-${option.hex}`}
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          colorName: option.name,
                          colorHex: option.hex
                        }))
                      }
                      className={`flex items-center gap-2 border px-3 py-2 text-left text-sm ${
                        selected ? "border-text-primary bg-bg-secondary" : "border-border"
                      }`}
                    >
                      <span
                        className="h-4 w-4 rounded-full border border-black/20"
                        style={{ backgroundColor: option.hex }}
                        aria-hidden
                      />
                      <span>{option.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <textarea
              value={form.images}
              onChange={(event) => setForm((current) => ({ ...current, images: event.target.value }))}
              placeholder="URL фото (каждый с новой строки или через запятую)"
              className="min-h-[80px] w-full border border-border px-3 py-2"
            />

            <div className="space-y-2 border border-border p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs uppercase tracking-[0.08em] text-text-muted">Размеры и остаток</p>
                <button
                  type="button"
                  className="border border-border px-2 py-1 text-[11px] uppercase tracking-[0.08em]"
                  onClick={() => applySizeTemplate(form.gender, form.category)}
                >
                  Сбросить шаблон
                </button>
              </div>

              <div className="space-y-2">
                {form.sizes.map((item, index) => (
                  <div key={`${item.size}-${index}`} className="grid grid-cols-[88px_120px_1fr] items-center gap-2 text-sm">
                    <div className="border border-border px-2 py-2 text-center">{item.size}</div>
                    <label className="inline-flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={item.inStock}
                        onChange={(event) => updateSizeRow(index, { inStock: event.target.checked })}
                      />
                      В наличии
                    </label>
                    <input
                      value={item.quantity}
                      type="number"
                      min={0}
                      onChange={(event) => updateSizeRow(index, { quantity: event.target.value.replace(/\D/g, "") })}
                      placeholder="Кол-во"
                      className="border border-border px-3 py-2"
                    />
                  </div>
                ))}
              </div>

              <p className="text-xs text-text-secondary">Если количество больше 0, размер автоматически считается доступным.</p>
            </div>

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
            <div className="space-y-2 border border-border p-3">
              <div className="grid gap-2 md:grid-cols-3">
                <select
                  value={productFilterGender}
                  onChange={(event) => {
                    const nextGender = event.target.value as ProductFilterGender;
                    setProductFilterGender(nextGender);
                    setProductFilterCategory("all");
                  }}
                  className="border border-border px-3 py-2 text-sm"
                >
                  <option value="all">Все: пол</option>
                  <option value="women">Женское</option>
                  <option value="men">Мужское</option>
                  <option value="kids">Детское</option>
                </select>

                <select
                  value={productFilterCategory}
                  onChange={(event) => setProductFilterCategory(event.target.value)}
                  className="border border-border px-3 py-2 text-sm"
                >
                  <option value="all">Все категории</option>
                  {availableFilterCategories.map((category) => (
                    <option key={category.id} value={category.slug}>
                      {category.name}
                    </option>
                  ))}
                </select>

                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Поиск: название / артикул / slug"
                  className="border border-border px-3 py-2 text-sm"
                />
              </div>

              <p className="text-xs text-text-secondary">
                Показано: {(tab === "products" ? activeProducts : hiddenProducts).length} из {products.length}
              </p>
            </div>

            {tab === "products" && renderProductList(activeProducts, "active")}
            {tab === "hidden" && renderProductList(hiddenProducts, "hidden")}
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

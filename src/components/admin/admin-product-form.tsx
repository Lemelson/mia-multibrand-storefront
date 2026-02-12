"use client";

import { type Dispatch, type SetStateAction, useMemo } from "react";
import { createSizeDrafts, ADMIN_BRAND_OPTIONS, ADMIN_COLOR_OPTIONS, type AdminSizeDraft } from "@/lib/admin-options";
import type {
  Category,
  Gender,
  ProductSize,
  Store
} from "@/lib/types";

export interface ProductFormState {
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

export function createEmptyFormState(gender: Gender = "women", category = "dresses"): ProductFormState {
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

export function toSizeRows(sizes: AdminSizeDraft[]): ProductSize[] {
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

export function parseImages(value: string): string[] {
  return value
    .split(/\n|,/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

interface AdminProductFormProps {
  stores: Store[];
  categories: Category[];
  editingProductId: string | null;
  form: ProductFormState;
  setForm: Dispatch<SetStateAction<ProductFormState>>;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  submitting: boolean;
}

export function AdminProductForm({
  stores,
  categories,
  editingProductId,
  form,
  setForm,
  onSubmit,
  onCancel,
  submitting
}: AdminProductFormProps) {
  const categoriesByGender = useMemo(() => {
    return {
      women: categories.filter((item) => item.gender === "women"),
      men: categories.filter((item) => item.gender === "men"),
      kids: categories.filter((item) => item.gender === "kids")
    };
  }, [categories]);

  const genderCategories = categoriesByGender[form.gender];

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

  return (
    <form onSubmit={onSubmit} className="space-y-3 border border-border p-5">
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
            onClick={onCancel}
          >
            Отмена
          </button>
        )}
      </div>
    </form>
  );
}

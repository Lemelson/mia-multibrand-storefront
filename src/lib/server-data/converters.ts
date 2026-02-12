/**
 * Converters between domain types and Prisma DB records.
 */

import { Prisma } from "@prisma/client";
import type { Category, Order, Product, ProductColor, Store, StoreAvailability, OrderItem } from "@/lib/types";

// ---------------------------------------------------------------------------
// Runtime validators for JSON fields read from DB.
//
// These ensure that corrupted or manually-edited DB data doesn't propagate
// deep into React components where it would cause confusing runtime errors.
// ---------------------------------------------------------------------------

function isValidProductColor(value: unknown): value is ProductColor {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.id === "string" &&
    typeof obj.name === "string" &&
    typeof obj.hex === "string" &&
    Array.isArray(obj.images) &&
    Array.isArray(obj.sizes)
  );
}

function isValidStoreAvailability(value: unknown): value is StoreAvailability {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return typeof obj.storeId === "string" && typeof obj.available === "boolean";
}

function isValidOrderItem(value: unknown): value is OrderItem {
  if (!value || typeof value !== "object") return false;
  const obj = value as Record<string, unknown>;
  return (
    typeof obj.productId === "string" &&
    typeof obj.name === "string" &&
    typeof obj.price === "number" &&
    typeof obj.quantity === "number"
  );
}

function safeParseColors(json: Prisma.JsonValue): ProductColor[] {
  if (!Array.isArray(json)) return [];
  const result: ProductColor[] = [];
  for (const item of json) {
    if (isValidProductColor(item)) result.push(item);
  }
  return result;
}

function safeParseStoreAvailability(json: Prisma.JsonValue): StoreAvailability[] {
  if (!Array.isArray(json)) return [];
  const result: StoreAvailability[] = [];
  for (const item of json) {
    if (isValidStoreAvailability(item)) result.push(item);
  }
  return result;
}

function safeParseOrderItems(json: Prisma.JsonValue): OrderItem[] {
  if (!Array.isArray(json)) return [];
  const result: OrderItem[] = [];
  for (const item of json) {
    if (isValidOrderItem(item)) result.push(item);
  }
  return result;
}

function safeParseCustomer(json: Prisma.JsonValue): Order["customer"] {
  if (!json || typeof json !== "object" || Array.isArray(json)) {
    return { name: "", phone: "" };
  }
  const obj = json as Record<string, unknown>;
  return {
    name: typeof obj.name === "string" ? obj.name : "",
    phone: typeof obj.phone === "string" ? obj.phone : "",
    email: typeof obj.email === "string" ? obj.email : undefined,
    comment: typeof obj.comment === "string" ? obj.comment : undefined
  };
}

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

export function toProductRecord(product: Product): Prisma.ProductUncheckedCreateInput {
  return {
    id: product.id,
    sku: product.sku ?? null,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    description: product.description,
    composition: product.composition,
    care: product.care,
    category: product.category,
    gender: product.gender,
    price: product.price,
    oldPrice: product.oldPrice ?? null,
    colorsJson: product.colors as unknown as Prisma.InputJsonValue,
    storesJson: product.stores as unknown as Prisma.InputJsonValue,
    isNew: product.isNew,
    isActive: product.isActive,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt)
  };
}

export function fromProductRecord(record: {
  id: string;
  sku: string | null;
  slug: string;
  name: string;
  brand: string;
  description: string;
  composition: string;
  care: string;
  category: string;
  gender: string;
  price: number;
  oldPrice: number | null;
  colorsJson: Prisma.JsonValue;
  storesJson: Prisma.JsonValue;
  isNew: boolean;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}): Product {
  return {
    id: record.id,
    sku: record.sku ?? undefined,
    slug: record.slug,
    name: record.name,
    brand: record.brand,
    description: record.description,
    composition: record.composition,
    care: record.care,
    category: record.category,
    gender: record.gender as Product["gender"],
    price: record.price,
    oldPrice: record.oldPrice ?? undefined,
    colors: safeParseColors(record.colorsJson),
    stores: safeParseStoreAvailability(record.storesJson),
    isNew: record.isNew,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export function toStoreRecord(store: Store): Prisma.StoreUncheckedCreateInput {
  return {
    id: store.id,
    name: store.name,
    fullName: store.fullName ?? null,
    city: store.city,
    address: store.address,
    phone: store.phone,
    workingHours: store.workingHours,
    coordinatesJson: store.coordinates as Prisma.InputJsonValue,
    whatsapp: store.whatsapp,
    telegram: store.telegram
  };
}

export function fromStoreRecord(record: {
  id: string;
  name: string;
  fullName: string | null;
  city: string;
  address: string;
  phone: string;
  workingHours: string;
  coordinatesJson: Prisma.JsonValue;
  whatsapp: string;
  telegram: string;
}): Store {
  const coordinates =
    record.coordinatesJson && typeof record.coordinatesJson === "object"
      ? (record.coordinatesJson as Store["coordinates"])
      : { lat: 0, lng: 0 };

  return {
    id: record.id,
    name: record.name,
    fullName: record.fullName ?? undefined,
    city: record.city,
    address: record.address,
    phone: record.phone,
    workingHours: record.workingHours,
    coordinates,
    whatsapp: record.whatsapp,
    telegram: record.telegram
  };
}

// ---------------------------------------------------------------------------
// Category
// ---------------------------------------------------------------------------

export function toCategoryRecord(category: Category): Prisma.CategoryUncheckedCreateInput {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    gender: category.gender,
    parentId: category.parentId ?? null
  };
}

export function fromCategoryRecord(record: {
  id: string;
  slug: string;
  name: string;
  gender: string;
  parentId: string | null;
}): Category {
  return {
    id: record.id,
    slug: record.slug,
    name: record.name,
    gender: record.gender as Category["gender"],
    parentId: record.parentId ?? undefined
  };
}

// ---------------------------------------------------------------------------
// Order
// ---------------------------------------------------------------------------

export function toOrderRecord(order: Order): Prisma.OrderUncheckedCreateInput {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    itemsJson: order.items as unknown as Prisma.InputJsonValue,
    totalAmount: order.totalAmount,
    customerJson: order.customer as Prisma.InputJsonValue,
    delivery: order.delivery,
    storeId: order.storeId,
    paymentMethod: order.paymentMethod,
    status: order.status,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt)
  };
}

export function fromOrderRecord(record: {
  id: string;
  orderNumber: string;
  itemsJson: Prisma.JsonValue;
  totalAmount: number;
  customerJson: Prisma.JsonValue;
  delivery: string;
  storeId: string;
  paymentMethod: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}): Order {
  return {
    id: record.id,
    orderNumber: record.orderNumber,
    items: safeParseOrderItems(record.itemsJson),
    totalAmount: record.totalAmount,
    customer: safeParseCustomer(record.customerJson),
    delivery: record.delivery as Order["delivery"],
    storeId: record.storeId,
    paymentMethod: record.paymentMethod as Order["paymentMethod"],
    status: record.status as Order["status"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

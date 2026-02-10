import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { Category, Order, OrderStatus, Product, Store } from "@/lib/types";
import { slugify } from "@/lib/format";

const DATA_DIR = path.join(process.cwd(), "src/data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const STORES_FILE = path.join(DATA_DIR, "stores.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");

async function readJson<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

async function writeJson<T>(filePath: string, value: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export async function getProducts(): Promise<Product[]> {
  return readJson<Product[]>(PRODUCTS_FILE);
}

export async function getProductById(id: string): Promise<Product | undefined> {
  const products = await getProducts();
  return products.find((product) => product.id === id);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  const products = await getProducts();
  return products.find((product) => product.slug === slug);
}

export async function createProduct(
  input: Omit<Product, "id" | "slug" | "createdAt" | "updatedAt"> & { slug?: string }
): Promise<Product> {
  const products = await getProducts();
  const timestamp = new Date().toISOString();
  const baseSlug = input.slug && input.slug.trim() ? input.slug : slugify(input.name);
  const slug = ensureUniqueSlug(products, baseSlug);

  const product: Product = {
    ...input,
    id: randomUUID(),
    slug,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const nextProducts = [product, ...products];
  await writeJson(PRODUCTS_FILE, nextProducts);
  return product;
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product | null> {
  const products = await getProducts();
  const index = products.findIndex((product) => product.id === id);

  if (index === -1) {
    return null;
  }

  const current = products[index];
  const merged: Product = {
    ...current,
    ...patch,
    id: current.id,
    slug: patch.slug ? ensureUniqueSlug(products, patch.slug, current.id) : current.slug,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  products[index] = merged;
  await writeJson(PRODUCTS_FILE, products);
  return merged;
}

export async function deleteProduct(id: string): Promise<boolean> {
  const products = await getProducts();
  const nextProducts = products.filter((product) => product.id !== id);

  if (nextProducts.length === products.length) {
    return false;
  }

  await writeJson(PRODUCTS_FILE, nextProducts);
  return true;
}

export async function getStores(): Promise<Store[]> {
  return readJson<Store[]>(STORES_FILE);
}

export async function getStoreById(id: string): Promise<Store | undefined> {
  const stores = await getStores();
  return stores.find((store) => store.id === id);
}

export async function getCategories(): Promise<Category[]> {
  return readJson<Category[]>(CATEGORIES_FILE);
}

export async function getOrders(): Promise<Order[]> {
  return readJson<Order[]>(ORDERS_FILE);
}

export async function createOrder(
  input: Omit<Order, "id" | "orderNumber" | "status" | "createdAt" | "updatedAt">
): Promise<Order> {
  const orders = await getOrders();
  const timestamp = new Date().toISOString();
  const order: Order = {
    ...input,
    id: randomUUID(),
    orderNumber: createOrderNumber(orders.length + 1),
    status: "new",
    createdAt: timestamp,
    updatedAt: timestamp
  };

  const nextOrders = [order, ...orders];
  await writeJson(ORDERS_FILE, nextOrders);
  return order;
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  const orders = await getOrders();
  const index = orders.findIndex((order) => order.id === id);

  if (index === -1) {
    return null;
  }

  const current = orders[index];
  const updated: Order = {
    ...current,
    status,
    updatedAt: new Date().toISOString()
  };

  orders[index] = updated;
  await writeJson(ORDERS_FILE, orders);
  return updated;
}

export async function resetOrders(orders: Order[]): Promise<void> {
  await writeJson(ORDERS_FILE, orders);
}

function createOrderNumber(serial: number): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const suffix = String(serial).padStart(4, "0");
  return `MIA-${year}-${suffix}`;
}

function ensureUniqueSlug(products: Product[], slug: string, currentProductId?: string): string {
  const base = slugify(slug);
  let candidate = base;
  let index = 1;

  while (
    products.some(
      (product) =>
        product.slug === candidate &&
        (!currentProductId || product.id !== currentProductId)
    )
  ) {
    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

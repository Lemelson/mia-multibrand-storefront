import { promises as fs } from "fs";
import path from "path";
import { randomBytes, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db, getDataSourceMode, isDatabaseConfigured, isDualWriteEnabled } from "@/lib/db";
import type { Category, Order, OrderStatus, Product, Store } from "@/lib/types";
import { slugify } from "@/lib/format";

const DATA_DIR = path.join(process.cwd(), "src/data");
const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
const STORES_FILE = path.join(DATA_DIR, "stores.json");
const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
const ORDER_IDEMPOTENCY_FILE = path.join(DATA_DIR, "order-idempotency.json");

export interface OrderIdempotencyRecord {
  key: string;
  requestHash: string;
  orderId: string;
  createdAt: string;
}

export type CreateOrderWithIdempotencyResult =
  | { kind: "created"; order: Order }
  | { kind: "existing"; order: Order }
  | { kind: "conflict"; message: string };

function shouldReadFromDb(): boolean {
  if (!isDatabaseConfigured()) {
    return false;
  }

  // Vercel production runtime is read-only for local files.
  // If DB is configured, force DB reads/writes regardless of DATA_SOURCE flag.
  if (process.env.NODE_ENV === "production") {
    return true;
  }

  return getDataSourceMode() === "db";
}

function shouldWriteToDb(): boolean {
  if (!isDatabaseConfigured()) {
    return false;
  }

  return getDataSourceMode() === "db" || isDualWriteEnabled();
}

function shouldWriteToJson(): boolean {
  // Never write JSON files in production (read-only filesystem on Vercel).
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  if (getDataSourceMode() === "db") {
    return isDualWriteEnabled();
  }

  return true;
}

async function readJson<T>(filePath: string, fallback?: T): Promise<T> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && fallback !== undefined) {
      return fallback;
    }

    throw error;
  }
}

async function writeJson<T>(filePath: string, value: T): Promise<void> {
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

function toProductRecord(product: Product): Prisma.ProductUncheckedCreateInput {
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

function fromProductRecord(record: {
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
    colors: (Array.isArray(record.colorsJson) ? record.colorsJson : []) as unknown as Product["colors"],
    stores: (Array.isArray(record.storesJson) ? record.storesJson : []) as unknown as Product["stores"],
    isNew: record.isNew,
    isActive: record.isActive,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

function toStoreRecord(store: Store): Prisma.StoreUncheckedCreateInput {
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

function fromStoreRecord(record: {
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

function toCategoryRecord(category: Category): Prisma.CategoryUncheckedCreateInput {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    gender: category.gender,
    parentId: category.parentId ?? null
  };
}

function fromCategoryRecord(record: {
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

function toOrderRecord(order: Order): Prisma.OrderUncheckedCreateInput {
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

function fromOrderRecord(record: {
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
    items: (Array.isArray(record.itemsJson) ? record.itemsJson : []) as unknown as Order["items"],
    totalAmount: record.totalAmount,
    customer: ((record.customerJson && typeof record.customerJson === "object")
      ? record.customerJson
      : {}) as Order["customer"],
    delivery: record.delivery as Order["delivery"],
    storeId: record.storeId,
    paymentMethod: record.paymentMethod as Order["paymentMethod"],
    status: record.status as Order["status"],
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString()
  };
}

async function getProductsFromJson(): Promise<Product[]> {
  return readJson<Product[]>(PRODUCTS_FILE, []);
}

async function getProductsFromDb(): Promise<Product[]> {
  const products = await db.product.findMany({ orderBy: { createdAt: "desc" } });
  return products.map(fromProductRecord);
}

async function upsertProductInDb(product: Product): Promise<void> {
  const data = toProductRecord(product);
  await db.product.upsert({
    where: { id: product.id },
    create: data,
    update: data
  });
}

async function upsertProductInJson(product: Product): Promise<void> {
  const products = await getProductsFromJson();
  const index = products.findIndex((item) => item.id === product.id);

  if (index === -1) {
    products.unshift(product);
  } else {
    products[index] = product;
  }

  await writeJson(PRODUCTS_FILE, products);
}

async function deleteProductFromDb(id: string): Promise<boolean> {
  const result = await db.product.deleteMany({ where: { id } });
  return result.count > 0;
}

async function deleteProductFromJson(id: string): Promise<boolean> {
  const products = await getProductsFromJson();
  const nextProducts = products.filter((product) => product.id !== id);

  if (nextProducts.length === products.length) {
    return false;
  }

  await writeJson(PRODUCTS_FILE, nextProducts);
  return true;
}

async function getOrdersFromJson(): Promise<Order[]> {
  return readJson<Order[]>(ORDERS_FILE, []);
}

async function getOrdersFromDb(): Promise<Order[]> {
  const orders = await db.order.findMany({ orderBy: { createdAt: "desc" } });
  return orders.map(fromOrderRecord);
}

async function upsertOrderInDb(order: Order): Promise<void> {
  const data = toOrderRecord(order);
  await db.order.upsert({
    where: { id: order.id },
    create: data,
    update: data
  });
}

async function upsertOrderInJson(order: Order): Promise<void> {
  const orders = await getOrdersFromJson();
  const index = orders.findIndex((item) => item.id === order.id);

  if (index === -1) {
    orders.unshift(order);
  } else {
    orders[index] = order;
  }

  await writeJson(ORDERS_FILE, orders);
}

async function ensureUniqueSlugDb(slug: string, currentProductId?: string): Promise<string> {
  const base = slugify(slug);
  let candidate = base;
  let index = 1;

  while (true) {
    const found = await db.product.findFirst({ where: { slug: candidate } });
    if (!found || (currentProductId && found.id === currentProductId)) {
      return candidate;
    }

    candidate = `${base}-${index}`;
    index += 1;
  }
}

async function createProductInJson(
  input: Omit<Product, "id" | "slug" | "createdAt" | "updatedAt"> & { slug?: string }
): Promise<Product> {
  const products = await getProductsFromJson();
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

async function createProductInDb(
  input: Omit<Product, "id" | "slug" | "createdAt" | "updatedAt"> & { slug?: string }
): Promise<Product> {
  const timestamp = new Date().toISOString();
  const baseSlug = input.slug && input.slug.trim() ? input.slug : slugify(input.name);
  const slug = await ensureUniqueSlugDb(baseSlug);

  const product: Product = {
    ...input,
    id: randomUUID(),
    slug,
    createdAt: timestamp,
    updatedAt: timestamp
  };

  await db.product.create({ data: toProductRecord(product) });
  return product;
}

async function updateProductInJson(id: string, patch: Partial<Product>): Promise<Product | null> {
  const products = await getProductsFromJson();
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

async function updateProductInDb(id: string, patch: Partial<Product>): Promise<Product | null> {
  const currentRecord = await db.product.findUnique({ where: { id } });

  if (!currentRecord) {
    return null;
  }

  const current = fromProductRecord(currentRecord);
  const merged: Product = {
    ...current,
    ...patch,
    id: current.id,
    slug: patch.slug ? await ensureUniqueSlugDb(patch.slug, current.id) : current.slug,
    createdAt: current.createdAt,
    updatedAt: new Date().toISOString()
  };

  await db.product.update({
    where: { id },
    data: toProductRecord(merged)
  });

  return merged;
}

async function createOrderInJson(
  input: Omit<Order, "id" | "orderNumber" | "status" | "createdAt" | "updatedAt">
): Promise<Order> {
  const orders = await getOrdersFromJson();
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

function createOrderNumberCandidate(): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const timePart = Date.now().toString(36).toUpperCase();
  const randomPart = randomBytes(2).toString("hex").toUpperCase();
  return `MIA-${year}-${timePart}-${randomPart}`;
}

function isPrismaUniqueError(error: unknown, fieldName: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError)) {
    return false;
  }

  if (error.code !== "P2002") {
    return false;
  }

  const rawTarget = error.meta?.target;
  const targets = Array.isArray(rawTarget) ? rawTarget : rawTarget ? [String(rawTarget)] : [];
  return targets.some((target) => String(target).includes(fieldName));
}

async function createOrderInDbWithClient(
  client: Prisma.TransactionClient | typeof db,
  input: Omit<Order, "id" | "orderNumber" | "status" | "createdAt" | "updatedAt">
): Promise<Order> {
  const timestamp = new Date().toISOString();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const order: Order = {
      ...input,
      id: randomUUID(),
      orderNumber: createOrderNumberCandidate(),
      status: "new",
      createdAt: timestamp,
      updatedAt: timestamp
    };

    try {
      await client.order.create({ data: toOrderRecord(order) });
      return order;
    } catch (error) {
      if (isPrismaUniqueError(error, "order_number")) {
        continue;
      }

      throw error;
    }
  }

  throw new Error("Failed to generate unique order number");
}

async function createOrderInDb(
  input: Omit<Order, "id" | "orderNumber" | "status" | "createdAt" | "updatedAt">
): Promise<Order> {
  return createOrderInDbWithClient(db, input);
}

async function updateOrderStatusInJson(id: string, status: OrderStatus): Promise<Order | null> {
  const orders = await getOrdersFromJson();
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

async function updateOrderStatusInDb(id: string, status: OrderStatus): Promise<Order | null> {
  const currentRecord = await db.order.findUnique({ where: { id } });

  if (!currentRecord) {
    return null;
  }

  const current = fromOrderRecord(currentRecord);
  const updated: Order = {
    ...current,
    status,
    updatedAt: new Date().toISOString()
  };

  await db.order.update({
    where: { id },
    data: toOrderRecord(updated)
  });

  return updated;
}

async function getOrderIdempotencyFromJson(key: string): Promise<OrderIdempotencyRecord | null> {
  const records = await readJson<OrderIdempotencyRecord[]>(ORDER_IDEMPOTENCY_FILE, []);
  return records.find((record) => record.key === key) ?? null;
}

async function saveOrderIdempotencyToJson(record: OrderIdempotencyRecord): Promise<void> {
  const records = await readJson<OrderIdempotencyRecord[]>(ORDER_IDEMPOTENCY_FILE, []);
  const index = records.findIndex((entry) => entry.key === record.key);

  if (index === -1) {
    records.unshift(record);
  } else {
    records[index] = record;
  }

  await writeJson(ORDER_IDEMPOTENCY_FILE, records);
}

async function getOrderIdempotencyFromDb(key: string): Promise<OrderIdempotencyRecord | null> {
  const record = await db.orderIdempotency.findUnique({ where: { key } });

  if (!record) {
    return null;
  }

  return {
    key: record.key,
    requestHash: record.requestHash,
    orderId: record.orderId,
    createdAt: record.createdAt.toISOString()
  };
}

async function saveOrderIdempotencyToDb(record: OrderIdempotencyRecord): Promise<void> {
  await db.orderIdempotency.upsert({
    where: { key: record.key },
    create: {
      key: record.key,
      requestHash: record.requestHash,
      orderId: record.orderId,
      createdAt: new Date(record.createdAt)
    },
    update: {
      requestHash: record.requestHash,
      orderId: record.orderId,
      createdAt: new Date(record.createdAt)
    }
  });
}

export async function getProducts(): Promise<Product[]> {
  if (shouldReadFromDb()) {
    return getProductsFromDb();
  }

  return getProductsFromJson();
}

export async function getProductById(id: string): Promise<Product | undefined> {
  if (shouldReadFromDb()) {
    const record = await db.product.findUnique({ where: { id } });
    return record ? fromProductRecord(record) : undefined;
  }

  const products = await getProductsFromJson();
  return products.find((product) => product.id === id);
}

export async function getProductBySlug(slug: string): Promise<Product | undefined> {
  if (shouldReadFromDb()) {
    const record = await db.product.findUnique({ where: { slug } });
    return record ? fromProductRecord(record) : undefined;
  }

  const products = await getProductsFromJson();
  return products.find((product) => product.slug === slug);
}

export async function createProduct(
  input: Omit<Product, "id" | "slug" | "createdAt" | "updatedAt"> & { slug?: string }
): Promise<Product> {
  if (shouldReadFromDb()) {
    const product = await createProductInDb(input);

    if (shouldWriteToJson()) {
      await upsertProductInJson(product);
    }

    return product;
  }

  const product = await createProductInJson(input);

  if (shouldWriteToDb()) {
    await upsertProductInDb(product);
  }

  return product;
}

export async function updateProduct(id: string, patch: Partial<Product>): Promise<Product | null> {
  if (shouldReadFromDb()) {
    const updated = await updateProductInDb(id, patch);

    if (updated && shouldWriteToJson()) {
      await upsertProductInJson(updated);
    }

    return updated;
  }

  const updated = await updateProductInJson(id, patch);

  if (updated && shouldWriteToDb()) {
    await upsertProductInDb(updated);
  }

  return updated;
}

export async function deleteProduct(id: string): Promise<boolean> {
  if (shouldReadFromDb()) {
    const ok = await deleteProductFromDb(id);

    if (ok && shouldWriteToJson()) {
      await deleteProductFromJson(id);
    }

    return ok;
  }

  const ok = await deleteProductFromJson(id);

  if (ok && shouldWriteToDb()) {
    await deleteProductFromDb(id);
  }

  return ok;
}

export async function getStores(): Promise<Store[]> {
  if (shouldReadFromDb()) {
    const stores = await db.store.findMany();
    return stores.map(fromStoreRecord);
  }

  return readJson<Store[]>(STORES_FILE, []);
}

export async function getStoreById(id: string): Promise<Store | undefined> {
  if (shouldReadFromDb()) {
    const store = await db.store.findUnique({ where: { id } });
    return store ? fromStoreRecord(store) : undefined;
  }

  const stores = await getStores();
  return stores.find((store) => store.id === id);
}

export async function getCategories(): Promise<Category[]> {
  if (shouldReadFromDb()) {
    const categories = await db.category.findMany();
    return categories.map(fromCategoryRecord);
  }

  return readJson<Category[]>(CATEGORIES_FILE, []);
}

export async function getOrders(): Promise<Order[]> {
  if (shouldReadFromDb()) {
    return getOrdersFromDb();
  }

  return getOrdersFromJson();
}

export async function createOrder(
  input: Omit<Order, "id" | "orderNumber" | "status" | "createdAt" | "updatedAt">
): Promise<Order> {
  if (shouldReadFromDb()) {
    const order = await createOrderInDb(input);

    if (shouldWriteToJson()) {
      await upsertOrderInJson(order);
    }

    return order;
  }

  const order = await createOrderInJson(input);

  if (shouldWriteToDb()) {
    await upsertOrderInDb(order);
  }

  return order;
}

export async function createOrderWithIdempotency(input: {
  key: string;
  requestHash: string;
  order: Omit<Order, "id" | "orderNumber" | "status" | "createdAt" | "updatedAt">;
}): Promise<CreateOrderWithIdempotencyResult> {
  if (shouldReadFromDb()) {
    const createInTransaction = async (): Promise<CreateOrderWithIdempotencyResult> => {
      return db.$transaction(
        async (tx) => {
          const existing = await tx.orderIdempotency.findUnique({
            where: { key: input.key }
          });

          if (existing) {
            if (existing.requestHash !== input.requestHash) {
              return {
                kind: "conflict",
                message: "Idempotency conflict: payload differs for this key"
              };
            }

            const existingOrder = await tx.order.findUnique({
              where: { id: existing.orderId }
            });

            if (!existingOrder) {
              return {
                kind: "conflict",
                message: "Idempotency record found, but order is missing"
              };
            }

            return {
              kind: "existing",
              order: fromOrderRecord(existingOrder)
            };
          }

          const order = await createOrderInDbWithClient(tx, input.order);

          await tx.orderIdempotency.create({
            data: {
              key: input.key,
              requestHash: input.requestHash,
              orderId: order.id
            }
          });

          return {
            kind: "created",
            order
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    };

    try {
      const result = await createInTransaction();

      if ((result.kind === "created" || result.kind === "existing") && shouldWriteToJson()) {
        await upsertOrderInJson(result.order);

        await saveOrderIdempotencyToJson({
          key: input.key,
          requestHash: input.requestHash,
          orderId: result.order.id,
          createdAt: new Date().toISOString()
        });
      }

      return result;
    } catch (error) {
      if (isPrismaUniqueError(error, "key")) {
        const existing = await db.orderIdempotency.findUnique({
          where: { key: input.key }
        });

        if (existing) {
          if (existing.requestHash !== input.requestHash) {
            return {
              kind: "conflict",
              message: "Idempotency conflict: payload differs for this key"
            };
          }

          const existingOrder = await db.order.findUnique({
            where: { id: existing.orderId }
          });

          if (!existingOrder) {
            return {
              kind: "conflict",
              message: "Idempotency record found, but order is missing"
            };
          }

          return {
            kind: "existing",
            order: fromOrderRecord(existingOrder)
          };
        }
      }

      throw error;
    }
  }

  const existing = await getOrderIdempotencyFromJson(input.key);

  if (existing) {
    if (existing.requestHash !== input.requestHash) {
      return {
        kind: "conflict",
        message: "Idempotency conflict: payload differs for this key"
      };
    }

    const orders = await getOrdersFromJson();
    const existingOrder = orders.find((order) => order.id === existing.orderId);

    if (!existingOrder) {
      return {
        kind: "conflict",
        message: "Idempotency record found, but order is missing"
      };
    }

    return {
      kind: "existing",
      order: existingOrder
    };
  }

  const order = await createOrderInJson(input.order);
  await saveOrderIdempotencyToJson({
    key: input.key,
    requestHash: input.requestHash,
    orderId: order.id,
    createdAt: new Date().toISOString()
  });

  if (shouldWriteToDb()) {
    await upsertOrderInDb(order);
    await saveOrderIdempotencyToDb({
      key: input.key,
      requestHash: input.requestHash,
      orderId: order.id,
      createdAt: new Date().toISOString()
    });
  }

  return {
    kind: "created",
    order
  };
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order | null> {
  if (shouldReadFromDb()) {
    const updated = await updateOrderStatusInDb(id, status);

    if (updated && shouldWriteToJson()) {
      await upsertOrderInJson(updated);
    }

    return updated;
  }

  const updated = await updateOrderStatusInJson(id, status);

  if (updated && shouldWriteToDb()) {
    await upsertOrderInDb(updated);
  }

  return updated;
}

export async function resetOrders(orders: Order[]): Promise<void> {
  if (shouldWriteToJson()) {
    await writeJson(ORDERS_FILE, orders);
  }

  if (shouldWriteToDb()) {
    for (const order of orders) {
      await upsertOrderInDb(order);
    }
  }
}

export async function upsertStores(stores: Store[]): Promise<void> {
  if (shouldWriteToJson()) {
    await writeJson(STORES_FILE, stores);
  }

  if (shouldWriteToDb()) {
    for (const store of stores) {
      const data = toStoreRecord(store);
      await db.store.upsert({ where: { id: store.id }, create: data, update: data });
    }
  }
}

export async function upsertCategories(categories: Category[]): Promise<void> {
  if (shouldWriteToJson()) {
    await writeJson(CATEGORIES_FILE, categories);
  }

  if (shouldWriteToDb()) {
    for (const category of categories) {
      const data = toCategoryRecord(category);
      await db.category.upsert({ where: { id: category.id }, create: data, update: data });
    }
  }
}

export async function getOrderIdempotencyByKey(key: string): Promise<OrderIdempotencyRecord | null> {
  if (shouldReadFromDb()) {
    return getOrderIdempotencyFromDb(key);
  }

  return getOrderIdempotencyFromJson(key);
}

export async function saveOrderIdempotency(record: OrderIdempotencyRecord): Promise<void> {
  if (shouldWriteToDb()) {
    await saveOrderIdempotencyToDb(record);
  }

  if (shouldWriteToJson()) {
    await saveOrderIdempotencyToJson(record);
  }
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

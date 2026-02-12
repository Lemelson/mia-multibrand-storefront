/**
 * Product data access: CRUD operations for DB and JSON storage.
 */

import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { slugify } from "@/lib/format";
import type { Product } from "@/lib/types";
import { toProductRecord, fromProductRecord } from "./converters";
import {
  PRODUCTS_FILE,
  readJson,
  writeJson,
  shouldReadFromDb,
  shouldWriteToDb,
  shouldWriteToJson
} from "./storage";

const MAX_SLUG_ATTEMPTS = 100;

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

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
    if (index >= MAX_SLUG_ATTEMPTS) {
      candidate = `${base}-${randomUUID().slice(0, 8)}`;
      break;
    }

    candidate = `${base}-${index}`;
    index += 1;
  }

  return candidate;
}

async function ensureUniqueSlugDb(slug: string, currentProductId?: string): Promise<string> {
  const base = slugify(slug);
  let candidate = base;
  let index = 1;

  while (index <= MAX_SLUG_ATTEMPTS) {
    const found = await db.product.findFirst({ where: { slug: candidate } });
    if (!found || (currentProductId && found.id === currentProductId)) {
      return candidate;
    }

    candidate = `${base}-${index}`;
    index += 1;
  }

  // Fallback: append random suffix to guarantee uniqueness.
  return `${base}-${randomUUID().slice(0, 8)}`;
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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

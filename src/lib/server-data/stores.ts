/**
 * Store and Category data access.
 */

import { db } from "@/lib/db";
import type { Category, Store } from "@/lib/types";
import { toStoreRecord, fromStoreRecord, toCategoryRecord, fromCategoryRecord } from "./converters";
import {
  STORES_FILE,
  CATEGORIES_FILE,
  readJson,
  writeJson,
  shouldReadFromDb,
  shouldWriteToDb,
  shouldWriteToJson
} from "./storage";

// ---------------------------------------------------------------------------
// Stores
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Categories
// ---------------------------------------------------------------------------

export async function getCategories(): Promise<Category[]> {
  if (shouldReadFromDb()) {
    const categories = await db.category.findMany();
    return categories.map(fromCategoryRecord);
  }

  return readJson<Category[]>(CATEGORIES_FILE, []);
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

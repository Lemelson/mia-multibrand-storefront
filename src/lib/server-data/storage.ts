/**
 * Low-level storage helpers: JSON file I/O and data-source resolution.
 */

import { promises as fs } from "fs";
import path from "path";
import { getDataSourceMode, isDatabaseConfigured, isDualWriteEnabled } from "@/lib/db";

export const DATA_DIR = path.join(process.cwd(), "src/data");
export const PRODUCTS_FILE = path.join(DATA_DIR, "products.json");
export const STORES_FILE = path.join(DATA_DIR, "stores.json");
export const CATEGORIES_FILE = path.join(DATA_DIR, "categories.json");
export const ORDERS_FILE = path.join(DATA_DIR, "orders.json");
export const ORDER_IDEMPOTENCY_FILE = path.join(DATA_DIR, "order-idempotency.json");

export async function readJson<T>(filePath: string, fallback?: T): Promise<T> {
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

export async function writeJson<T>(filePath: string, value: T): Promise<void> {
  if (!shouldWriteToJson()) {
    // Make the failure mode explicit and actionable. Many runtimes (e.g. Vercel)
    // have a read-only filesystem in production, so JSON persistence is not viable.
    throw new Error(
      "JSON storage is read-only in this runtime. Configure DB mode: DATA_SOURCE=db and valid DATABASE_URL/DIRECT_URL."
    );
  }

  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
}

export function shouldReadFromDb(): boolean {
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

export function shouldWriteToDb(): boolean {
  if (!isDatabaseConfigured()) {
    return false;
  }

  return getDataSourceMode() === "db" || isDualWriteEnabled();
}

export function shouldWriteToJson(): boolean {
  // Never write JSON files in production (read-only filesystem on Vercel).
  if (process.env.NODE_ENV === "production") {
    return false;
  }

  // If DB is not configured, JSON is the only available persistence layer,
  // regardless of what DATA_SOURCE is set to (e.g. a dev env copied from template).
  if (!isDatabaseConfigured()) {
    return true;
  }

  if (getDataSourceMode() === "db") {
    return isDualWriteEnabled();
  }

  return true;
}

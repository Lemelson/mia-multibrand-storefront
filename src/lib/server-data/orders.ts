/**
 * Order data access: CRUD, idempotency, order number generation.
 */

import { randomBytes, randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import type { Order, OrderStatus } from "@/lib/types";
import { toOrderRecord, fromOrderRecord } from "./converters";
import {
  ORDERS_FILE,
  ORDER_IDEMPOTENCY_FILE,
  readJson,
  writeJson,
  shouldReadFromDb,
  shouldWriteToDb,
  shouldWriteToJson
} from "./storage";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function createOrderNumber(serial: number): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const suffix = String(serial).padStart(4, "0");
  return `MIA-${year}-${suffix}`;
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

// ---------------------------------------------------------------------------
// JSON operations
// ---------------------------------------------------------------------------

async function getOrdersFromJson(): Promise<Order[]> {
  return readJson<Order[]>(ORDERS_FILE, []);
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

// ---------------------------------------------------------------------------
// DB operations
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

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

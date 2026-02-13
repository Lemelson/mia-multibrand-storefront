import crypto from "crypto";
import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-session";
import {
  createOrderWithIdempotency,
  getOrders,
  getProductById,
  getStoreById,
} from "@/lib/server-data";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";
import {
  createOrderInputSchema,
  formatZodError,
  idempotencyKeySchema,
  type CreateOrderInput
} from "@/lib/validation";
import type { OrderItem } from "@/lib/types";

const orderLimiter = createRateLimiter("create-order", {
  limit: 10,
  windowMs: 60 * 1000 // 10 orders per minute per IP
});

function getStorageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (/EROFS|read-only|EACCES|EPERM/i.test(error.message)) {
      return "Текущий деплой работает с read-only файловой системой. Для Vercel включите БД-режим: DATA_SOURCE=db и корректные DATABASE_URL/DIRECT_URL.";
    }
    return error.message || fallback;
  }

  return fallback;
}

function createRequestHash(payload: CreateOrderInput): string {
  return crypto.createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function buildOrderItems(payload: CreateOrderInput): Promise<{
  items: OrderItem[];
  totalAmount: number;
  issues: string[];
}> {
  const uniqueProductIds = Array.from(new Set(payload.items.map((item) => item.productId)));
  const productEntries = await Promise.all(
    uniqueProductIds.map(async (id) => ({ id, product: await getProductById(id) }))
  );

  const productMap = new Map(productEntries.map((entry) => [entry.id, entry.product]));

  const issues: string[] = [];
  const items: OrderItem[] = [];

  for (const requestItem of payload.items) {
    const product = productMap.get(requestItem.productId);

    if (!product || !product.isActive) {
      issues.push(`Товар ${requestItem.productId} недоступен`);
      continue;
    }

    const inStore = product.stores.some(
      (store) => store.storeId === payload.storeId && store.available
    );

    if (!inStore) {
      issues.push(`Товар ${product.name} недоступен в магазине ${payload.storeId}`);
      continue;
    }

    const color = product.colors.find((value) => value.id === requestItem.colorId);

    if (!color) {
      issues.push(`Цвет ${requestItem.colorId} для ${product.name} недоступен`);
      continue;
    }

    const size = color.sizes.find((value) => value.size === requestItem.size);

    if (!size || !size.inStock) {
      issues.push(`Размер ${requestItem.size} для ${product.name} недоступен`);
      continue;
    }

    if (typeof size.quantity === "number" && Number.isFinite(size.quantity)) {
      if (requestItem.quantity > size.quantity) {
        issues.push(
          `Недостаточно остатка для ${product.name} (${requestItem.size}): доступно ${size.quantity}, запрошено ${requestItem.quantity}`
        );
        continue;
      }
    }

    items.push({
      productId: product.id,
      name: product.name,
      brand: product.brand,
      color: color.name,
      size: requestItem.size,
      price: product.price,
      quantity: requestItem.quantity,
      imageUrl: color.images[0] ?? ""
    });
  }

  const totalAmount = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  return {
    items,
    totalAmount,
    issues
  };
}

export async function GET(request: Request) {
  if (!isAdminSession()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const rawPage = Number(searchParams.get("page") ?? "1");
  const rawPageSize = Number(searchParams.get("pageSize") ?? "50");

  const page = Number.isFinite(rawPage) && rawPage > 0 ? rawPage : 1;
  const pageSize = Math.min(
    Number.isFinite(rawPageSize) && rawPageSize > 0 ? rawPageSize : 50,
    200 // hard cap
  );

  const allOrders = await getOrders();
  const total = allOrders.length;
  const start = (page - 1) * pageSize;
  const items = allOrders.slice(start, start + pageSize);

  return NextResponse.json({
    items,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total
  });
}

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateCheck = orderLimiter.check(ip);

  if (!rateCheck.allowed) {
    const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
    return NextResponse.json(
      { message: "Слишком много запросов. Попробуйте позже." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) }
      }
    );
  }

  const idempotencyHeader = request.headers.get("Idempotency-Key");
  const idempotencyResult = idempotencyKeySchema.safeParse(idempotencyHeader ?? "");

  if (!idempotencyResult.success) {
    return NextResponse.json(
      {
        message: "Missing or invalid Idempotency-Key header"
      },
      { status: 400 }
    );
  }

  const parsedJson = await request.json();
  const parsed = createOrderInputSchema.safeParse(parsedJson);

  if (!parsed.success) {
    return NextResponse.json(formatZodError(parsed.error), { status: 400 });
  }

  const payload = parsed.data;
  const requestHash = createRequestHash(payload);
  const idempotencyKey = idempotencyResult.data;

  // Validate that the specified store exists.
  const store = await getStoreById(payload.storeId);
  if (!store) {
    return NextResponse.json(
      { message: "Указанный магазин не найден", issues: [`Магазин ${payload.storeId} не существует`] },
      { status: 400 }
    );
  }

  const { items, totalAmount, issues } = await buildOrderItems(payload);

  if (issues.length > 0 || items.length === 0) {
    return NextResponse.json(
      {
        message: "Order validation failed",
        issues
      },
      { status: 400 }
    );
  }

  try {
    const result = await createOrderWithIdempotency({
      key: idempotencyKey,
      requestHash,
      order: {
        customer: {
          name: payload.customer.name.trim(),
          phone: payload.customer.phone.trim(),
          email: payload.customer.email?.trim() || undefined,
          comment: payload.customer.comment?.trim() || undefined
        },
        items,
        totalAmount,
        delivery: payload.delivery,
        paymentMethod: payload.paymentMethod,
        storeId: payload.storeId
      }
    });

    if (result.kind === "conflict") {
      return NextResponse.json({ message: result.message }, { status: 409 });
    }

    if (result.kind === "existing") {
      return NextResponse.json(result.order);
    }

    return NextResponse.json(result.order, { status: 201 });
  } catch (error) {
    const message = getStorageErrorMessage(error, "Не удалось создать заказ");
    return NextResponse.json({ message }, { status: 500 });
  }
}

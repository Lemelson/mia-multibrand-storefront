import crypto from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import {
  createOrderWithIdempotency,
  getOrders,
  getProductById,
} from "@/lib/server-data";
import {
  createOrderInputSchema,
  formatZodError,
  idempotencyKeySchema,
  type CreateOrderInput
} from "@/lib/validation";
import type { OrderItem } from "@/lib/types";

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  try {
    return verifyAdminToken(token);
  } catch {
    return false;
  }
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

export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const orders = await getOrders();
  return NextResponse.json(orders);
}

export async function POST(request: Request) {
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
}

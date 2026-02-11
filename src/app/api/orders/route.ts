import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { createOrder, getOrders } from "@/lib/server-data";
import type { Order } from "@/lib/types";

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
}

export async function GET() {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const orders = await getOrders();
  return NextResponse.json(orders);
}

export async function POST(request: Request) {
  const payload = (await request.json()) as Partial<Order>;

  if (!payload.customer?.name || !payload.customer?.phone || !payload.items?.length) {
    return NextResponse.json({ message: "Missing required fields" }, { status: 400 });
  }

  const totalAmount = payload.items.reduce(
    (sum, item) => sum + item.price * item.quantity,
    0
  );

  const order = await createOrder({
    customer: payload.customer,
    items: payload.items,
    totalAmount,
    delivery: payload.delivery ?? "pickup",
    paymentMethod: payload.paymentMethod ?? "cash",
    storeId: payload.storeId ?? "mantera-sirius"
  });

  return NextResponse.json(order, { status: 201 });
}

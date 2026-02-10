import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { updateOrderStatus } from "@/lib/server-data";
import type { OrderStatus } from "@/lib/types";

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const payload = (await request.json()) as { status?: OrderStatus };

  if (!payload.status) {
    return NextResponse.json({ message: "Status is required" }, { status: 400 });
  }

  const order = await updateOrderStatus(params.id, payload.status);

  if (!order) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json(order);
}

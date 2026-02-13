import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-session";
import { updateOrderStatus } from "@/lib/server-data";
import { formatZodError, patchOrderStatusInputSchema } from "@/lib/validation";

function getStorageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (/EROFS|read-only|EACCES|EPERM/i.test(error.message)) {
      return "Текущий деплой работает с read-only файловой системой. Для Vercel включите БД-режим: DATA_SOURCE=db и корректные DATABASE_URL/DIRECT_URL.";
    }
    return error.message || fallback;
  }

  return fallback;
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdminSession()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const parsedJson = await request.json();
    const parsed = patchOrderStatusInputSchema.safeParse(parsedJson);

    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }

    const order = await updateOrderStatus(params.id, parsed.data.status);

    if (!order) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json(order);
  } catch (error) {
    const message = getStorageErrorMessage(error, "Не удалось обновить статус заказа");
    return NextResponse.json({ message }, { status: 500 });
  }
}

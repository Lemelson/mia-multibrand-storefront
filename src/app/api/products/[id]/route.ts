import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { deleteProduct, getProductById, updateProduct } from "@/lib/server-data";
import { formatZodError, patchProductInputSchema } from "@/lib/validation";

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  try {
    return verifyAdminToken(token);
  } catch {
    return false;
  }
}

function getStorageErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    if (/EROFS|read-only|EACCES|EPERM/i.test(error.message)) {
      return "Текущий деплой работает с read-only файловой системой. Для Vercel включите БД-режим: DATA_SOURCE=db и корректные DATABASE_URL/DIRECT_URL.";
    }
    return error.message || fallback;
  }

  return fallback;
}

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const product = await getProductById(params.id);

  if (!product) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const payload = (await request.json()) as unknown;
    const parsed = patchProductInputSchema.safeParse(payload);

    if (!parsed.success) {
      return NextResponse.json(formatZodError(parsed.error), { status: 400 });
    }

    const product = await updateProduct(params.id, parsed.data);

    if (!product) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json(product);
  } catch (error) {
    const message = getStorageErrorMessage(error, "Не удалось обновить товар");
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  try {
    const ok = await deleteProduct(params.id);

    if (!ok) {
      return NextResponse.json({ message: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = getStorageErrorMessage(error, "Не удалось удалить товар");
    return NextResponse.json({ message }, { status: 500 });
  }
}

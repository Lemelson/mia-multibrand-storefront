import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { deleteProduct, getProductById, updateProduct } from "@/lib/server-data";
import type { Product } from "@/lib/types";

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
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

  const payload = (await request.json()) as Partial<Product>;
  const product = await updateProduct(params.id, payload);

  if (!product) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json(product);
}

export async function DELETE(
  _request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

  const ok = await deleteProduct(params.id);

  if (!ok) {
    return NextResponse.json({ message: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ success: true });
}

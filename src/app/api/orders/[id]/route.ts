import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";
import { updateOrderStatus } from "@/lib/server-data";
import { formatZodError, patchOrderStatusInputSchema } from "@/lib/validation";

function isAdmin(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  try {
    return verifyAdminToken(token);
  } catch {
    return false;
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdmin()) {
    return NextResponse.json({ message: "Unauthorized" }, { status: 401 });
  }

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
}

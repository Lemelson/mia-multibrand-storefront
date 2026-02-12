import { NextResponse } from "next/server";
import { isAdminSession } from "@/lib/admin-session";
import { updateOrderStatus } from "@/lib/server-data";
import { formatZodError, patchOrderStatusInputSchema } from "@/lib/validation";

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  if (!isAdminSession()) {
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

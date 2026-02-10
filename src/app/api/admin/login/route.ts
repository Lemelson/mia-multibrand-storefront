import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminToken, getAdminPassword } from "@/lib/auth";

export async function POST(request: Request) {
  const payload = (await request.json()) as { password?: string };

  if (!payload.password || payload.password !== getAdminPassword()) {
    return NextResponse.json({ message: "Неверный пароль" }, { status: 401 });
  }

  const response = NextResponse.json({ success: true });
  response.cookies.set({
    name: ADMIN_COOKIE,
    value: createAdminToken(),
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    secure: process.env.NODE_ENV === "production",
    maxAge: 60 * 60 * 12
  });

  return response;
}

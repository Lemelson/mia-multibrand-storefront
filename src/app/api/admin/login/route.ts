import { NextResponse } from "next/server";
import { ADMIN_COOKIE, createAdminToken, getAdminPassword } from "@/lib/auth";
import { createRateLimiter, getClientIp } from "@/lib/rate-limit";

const loginLimiter = createRateLimiter("admin-login", {
  limit: 5,
  windowMs: 60 * 1000 // 5 attempts per minute
});

export async function POST(request: Request) {
  const ip = getClientIp(request);
  const rateCheck = loginLimiter.check(ip);

  if (!rateCheck.allowed) {
    const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
    return NextResponse.json(
      { message: "Слишком много попыток входа. Попробуйте позже." },
      {
        status: 429,
        headers: { "Retry-After": String(retryAfterSec) }
      }
    );
  }

  try {
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
  } catch (error) {
    const message = error instanceof Error ? error.message : "Admin configuration error";
    return NextResponse.json({ message }, { status: 500 });
  }
}

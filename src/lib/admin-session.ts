import { cookies } from "next/headers";
import { ADMIN_COOKIE, verifyAdminToken } from "@/lib/auth";

export function isAdminSession(): boolean {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifyAdminToken(token);
}

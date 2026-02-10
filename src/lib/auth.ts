import crypto from "crypto";

export const ADMIN_COOKIE = "mia_admin_session";

function getSecret(): string {
  return process.env.ADMIN_SECRET ?? "mia-local-secret";
}

export function getAdminPassword(): string {
  return process.env.ADMIN_PASSWORD ?? "mia-admin";
}

export function createAdminToken(): string {
  const payload = `admin:${Date.now()}`;
  const signature = crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function verifyAdminToken(token?: string | null): boolean {
  if (!token) {
    return false;
  }

  try {
    const decoded = Buffer.from(token, "base64url").toString("utf8");
    const [role, timestamp, signature] = decoded.split(":");

    if (role !== "admin" || !timestamp || !signature) {
      return false;
    }

    const expected = crypto
      .createHmac("sha256", getSecret())
      .update(`admin:${timestamp}`)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

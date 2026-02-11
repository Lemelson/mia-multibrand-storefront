import crypto from "crypto";

export const ADMIN_COOKIE = "mia_admin_session";
const DEFAULT_ADMIN_PASSWORD = "mia-admin";
const DEFAULT_ADMIN_SECRET = "mia-local-secret";
const LEGACY_DEFAULT_ADMIN_SECRET = "change-this-secret";

function isProduction(): boolean {
  return process.env.NODE_ENV === "production";
}

function readSecret(): string {
  return process.env.ADMIN_SECRET ?? DEFAULT_ADMIN_SECRET;
}

function readPassword(): string {
  return process.env.ADMIN_PASSWORD ?? DEFAULT_ADMIN_PASSWORD;
}

export function assertAdminConfig(): void {
  if (!isProduction()) {
    return;
  }

  const password = readPassword();
  const secret = readSecret();

  if (!password || password === DEFAULT_ADMIN_PASSWORD) {
    throw new Error("Invalid ADMIN_PASSWORD for production environment");
  }

  if (
    !secret ||
    secret === DEFAULT_ADMIN_SECRET ||
    secret === LEGACY_DEFAULT_ADMIN_SECRET
  ) {
    throw new Error("Invalid ADMIN_SECRET for production environment");
  }
}

export function getAdminPassword(): string {
  assertAdminConfig();
  return readPassword();
}

export function createAdminToken(): string {
  assertAdminConfig();
  const payload = `admin:${Date.now()}`;
  const signature = crypto.createHmac("sha256", readSecret()).update(payload).digest("hex");
  return Buffer.from(`${payload}:${signature}`).toString("base64url");
}

export function verifyAdminToken(token?: string | null): boolean {
  assertAdminConfig();

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
      .createHmac("sha256", readSecret())
      .update(`admin:${timestamp}`)
      .digest("hex");

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

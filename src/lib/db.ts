import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getDataSourceMode(): "json" | "db" {
  const value = (process.env.DATA_SOURCE ?? "").toLowerCase();

  if (value === "db" || value === "json") {
    return value;
  }

  return isDatabaseConfigured() ? "db" : "json";
}

export function isDualWriteEnabled(): boolean {
  return /^(1|true|yes)$/i.test(process.env.DUAL_WRITE ?? "false");
}

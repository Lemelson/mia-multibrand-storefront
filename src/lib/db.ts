import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

function resolveRuntimeDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ??
    process.env.POSTGRES_PRISMA_URL ??
    process.env.POSTGRES_URL ??
    undefined
  );
}

function resolveRuntimeDirectUrl(): string | undefined {
  return (
    process.env.DIRECT_URL ??
    process.env.POSTGRES_URL_NON_POOLING ??
    process.env.POSTGRES_URL ??
    undefined
  );
}

const runtimeDatabaseUrl = resolveRuntimeDatabaseUrl();
const runtimeDirectUrl = resolveRuntimeDirectUrl();

if (!process.env.DATABASE_URL && runtimeDatabaseUrl) {
  process.env.DATABASE_URL = runtimeDatabaseUrl;
}

if (!process.env.DIRECT_URL && runtimeDirectUrl) {
  process.env.DIRECT_URL = runtimeDirectUrl;
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"]
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = db;
}

export function isDatabaseConfigured(): boolean {
  return Boolean(resolveRuntimeDatabaseUrl());
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

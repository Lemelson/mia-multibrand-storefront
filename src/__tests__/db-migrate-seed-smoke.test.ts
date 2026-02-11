import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

describe("DB migrate/seed smoke", () => {
  it("has migration and seed artifacts", () => {
    expect(existsSync(path.join(ROOT, "prisma/schema.prisma"))).toBe(true);
    expect(existsSync(path.join(ROOT, "prisma/seed.ts"))).toBe(true);
    expect(existsSync(path.join(ROOT, "prisma/migrations/0001_init/migration.sql"))).toBe(true);
  });

  const hasDbEnv = Boolean(process.env.DATABASE_URL && process.env.DIRECT_URL);
  const maybeIt = hasDbEnv ? it : it.skip;

  maybeIt("applies migration and seed on empty DB", () => {
    execSync("npm run -s db:migrate:deploy", {
      cwd: ROOT,
      stdio: "pipe"
    });

    execSync("npm run -s db:seed", {
      cwd: ROOT,
      stdio: "pipe"
    });
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => undefined
  })
}));

vi.mock("@/lib/auth", () => ({
  ADMIN_COOKIE: "mia_admin_session",
  verifyAdminToken: vi.fn(() => false)
}));

vi.mock("@/lib/server-data", () => ({
  getOrders: vi.fn(async () => [])
}));

import { GET } from "@/app/api/orders/route";
import { verifyAdminToken } from "@/lib/auth";

const mockedVerify = vi.mocked(verifyAdminToken);

beforeEach(() => {
  vi.clearAllMocks();
  mockedVerify.mockReturnValue(false);
});

describe("Admin guard", () => {
  it("returns 401 for GET /api/orders without admin session", async () => {
    const response = await GET();
    expect(response.status).toBe(401);
  });
});

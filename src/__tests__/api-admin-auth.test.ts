import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => undefined
  })
}));

vi.mock("@/lib/admin-session", () => ({
  isAdminSession: vi.fn(() => false)
}));

vi.mock("@/lib/auth", () => ({
  ADMIN_COOKIE: "mia_admin_session",
  verifyAdminToken: vi.fn(() => false)
}));

vi.mock("@/lib/server-data", () => ({
  getOrders: vi.fn(async () => [])
}));

import { GET } from "@/app/api/orders/route";
import { isAdminSession } from "@/lib/admin-session";

const mockedIsAdmin = vi.mocked(isAdminSession);

beforeEach(() => {
  vi.clearAllMocks();
  mockedIsAdmin.mockReturnValue(false);
});

describe("Admin guard", () => {
  it("returns 401 for GET /api/orders without admin session", async () => {
    const request = new Request("http://localhost:3000/api/orders");
    const response = await GET(request);
    expect(response.status).toBe(401);
  });
});

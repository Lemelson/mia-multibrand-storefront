import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  cookies: () => ({
    get: () => ({ value: "token" })
  })
}));

vi.mock("@/lib/auth", () => ({
  ADMIN_COOKIE: "mia_admin_session",
  verifyAdminToken: vi.fn()
}));

vi.mock("@/lib/server-data", () => ({
  createProduct: vi.fn(),
  getProducts: vi.fn()
}));

import { POST } from "@/app/api/products/route";
import { verifyAdminToken } from "@/lib/auth";
import * as serverData from "@/lib/server-data";

const mockedVerifyAdminToken = vi.mocked(verifyAdminToken);
const mockedServerData = vi.mocked(serverData);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/products", () => {
  it("returns 401 without admin session", async () => {
    mockedVerifyAdminToken.mockReturnValue(false);

    const request = new Request("http://localhost/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });

    const response = await POST(request);
    expect(response.status).toBe(401);
  });

  it("returns 400 for invalid payload", async () => {
    mockedVerifyAdminToken.mockReturnValue(true);

    const request = new Request("http://localhost/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brand: "X" })
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates product for valid payload", async () => {
    mockedVerifyAdminToken.mockReturnValue(true);
    mockedServerData.createProduct.mockResolvedValue({
      id: "p-001",
      sku: "SKU",
      slug: "product",
      name: "Product",
      brand: "Brand",
      description: "",
      composition: "",
      care: "",
      category: "dresses",
      gender: "women",
      price: 100,
      colors: [],
      stores: [],
      isNew: true,
      isActive: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    } as any);

    const request = new Request("http://localhost/api/products", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: "Product",
        brand: "Brand",
        gender: "women",
        category: "dresses",
        price: 100,
        colors: [],
        stores: [],
        isNew: true,
        isActive: true
      })
    });

    const response = await POST(request);
    expect(response.status).toBe(201);
    expect(mockedServerData.createProduct).toHaveBeenCalledTimes(1);
  });
});

import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/server-data", () => ({
  createOrder: vi.fn(),
  getOrderIdempotencyByKey: vi.fn(),
  getOrders: vi.fn(),
  getProductById: vi.fn(),
  saveOrderIdempotency: vi.fn()
}));

import { POST } from "@/app/api/orders/route";
import * as serverData from "@/lib/server-data";

const mockedServerData = vi.mocked(serverData);

const validPayload = {
  customer: {
    name: "Test User",
    phone: "+79990000000"
  },
  delivery: "pickup",
  paymentMethod: "cash",
  storeId: "mantera-sirius",
  items: [
    {
      productId: "p-001",
      colorId: "p-001-c1",
      size: "M",
      quantity: 2
    }
  ]
};

const mockProduct = {
  id: "p-001",
  slug: "test-product",
  name: "Test Product",
  brand: "Brand",
  description: "",
  composition: "",
  care: "",
  category: "dresses",
  gender: "women" as const,
  price: 100,
  colors: [
    {
      id: "p-001-c1",
      name: "Black",
      hex: "#111111",
      images: ["/img.jpg"],
      sizes: [{ size: "M", inStock: true }]
    }
  ],
  stores: [{ storeId: "mantera-sirius", available: true }],
  isNew: true,
  isActive: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /api/orders", () => {
  it("returns 400 when idempotency key is missing", async () => {
    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(validPayload)
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
  });

  it("creates order using server-side price calculation", async () => {
    mockedServerData.getOrderIdempotencyByKey.mockResolvedValue(null);
    mockedServerData.getProductById.mockResolvedValue(mockProduct);
    mockedServerData.createOrder.mockImplementation(async (input: any) => ({
      id: "order-1",
      orderNumber: "MIA-2026-0001",
      items: input.items,
      totalAmount: input.totalAmount,
      customer: input.customer,
      delivery: input.delivery,
      storeId: input.storeId,
      paymentMethod: input.paymentMethod,
      status: "new",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }));

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "idem-key-123456"
      },
      body: JSON.stringify(validPayload)
    });

    const response = await POST(request);
    expect(response.status).toBe(201);

    expect(mockedServerData.createOrder).toHaveBeenCalledTimes(1);
    const createOrderArgs = mockedServerData.createOrder.mock.calls[0]?.[0] as any;
    expect(createOrderArgs.totalAmount).toBe(200);
    expect(createOrderArgs.items[0].price).toBe(100);
  });

  it("returns 409 for idempotency key reuse with different payload hash", async () => {
    mockedServerData.getOrderIdempotencyByKey.mockResolvedValue({
      key: "idem-key-123456",
      requestHash: "another-hash",
      orderId: "order-1",
      createdAt: new Date().toISOString()
    });

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "idem-key-123456"
      },
      body: JSON.stringify(validPayload)
    });

    const response = await POST(request);
    expect(response.status).toBe(409);
  });

  it("returns existing order for idempotent retry", async () => {
    const existingOrder = {
      id: "order-1",
      orderNumber: "MIA-2026-0001",
      items: [],
      totalAmount: 200,
      customer: { name: "Test", phone: "+7999" },
      delivery: "pickup" as const,
      storeId: "mantera-sirius",
      paymentMethod: "cash" as const,
      status: "new" as const,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    mockedServerData.getOrderIdempotencyByKey.mockImplementation(async () => {
      const crypto = await import("crypto");
      const hash = crypto
        .createHash("sha256")
        .update(JSON.stringify(validPayload))
        .digest("hex");

      return {
        key: "idem-key-123456",
        requestHash: hash,
        orderId: "order-1",
        createdAt: new Date().toISOString()
      };
    });
    mockedServerData.getOrders.mockResolvedValue([existingOrder as any]);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "idem-key-123456"
      },
      body: JSON.stringify(validPayload)
    });

    const response = await POST(request);
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.orderNumber).toBe("MIA-2026-0001");
    expect(mockedServerData.createOrder).not.toHaveBeenCalled();
  });

  it("returns 400 when product data is invalid for order", async () => {
    mockedServerData.getOrderIdempotencyByKey.mockResolvedValue(null);
    mockedServerData.getProductById.mockResolvedValue({
      ...mockProduct,
      stores: [{ storeId: "another-store", available: true }]
    } as any);

    const request = new Request("http://localhost/api/orders", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Idempotency-Key": "idem-key-123456"
      },
      body: JSON.stringify(validPayload)
    });

    const response = await POST(request);
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.issues.length).toBeGreaterThan(0);
  });
});

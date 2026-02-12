import { describe, expect, it, vi, beforeEach } from "vitest";

vi.mock("@/lib/server-data", () => ({
  createOrderWithIdempotency: vi.fn(),
  getProductById: vi.fn(),
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
    mockedServerData.getProductById.mockResolvedValue(mockProduct);
    mockedServerData.createOrderWithIdempotency.mockImplementation(async (input: any) => ({
      kind: "created",
      id: "order-1",
      orderNumber: "MIA-2026-0001",
      order: {
        items: input.order.items,
        totalAmount: input.order.totalAmount,
        customer: input.order.customer,
        delivery: input.order.delivery,
        storeId: input.order.storeId,
        paymentMethod: input.order.paymentMethod,
        status: "new",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }
    } as any));

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

    expect(mockedServerData.createOrderWithIdempotency).toHaveBeenCalledTimes(1);
    const createOrderArgs = mockedServerData.createOrderWithIdempotency.mock.calls[0]?.[0] as any;
    expect(createOrderArgs.order.totalAmount).toBe(200);
    expect(createOrderArgs.order.items[0].price).toBe(100);
  });

  it("returns 409 for idempotency key reuse with different payload hash", async () => {
    mockedServerData.getProductById.mockResolvedValue(mockProduct);
    mockedServerData.createOrderWithIdempotency.mockResolvedValue({
      kind: "conflict",
      message: "Idempotency conflict: payload differs for this key"
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

    mockedServerData.getProductById.mockResolvedValue(mockProduct);
    mockedServerData.createOrderWithIdempotency.mockResolvedValue({
      kind: "existing",
      order: existingOrder
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
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.orderNumber).toBe("MIA-2026-0001");
    expect(mockedServerData.createOrderWithIdempotency).toHaveBeenCalledTimes(1);
  });

  it("returns 400 when product data is invalid for order", async () => {
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

  it("returns 400 when requested quantity exceeds available quantity", async () => {
    mockedServerData.getProductById.mockResolvedValue({
      ...mockProduct,
      colors: [
        {
          ...mockProduct.colors[0],
          sizes: [{ size: "M", inStock: true, quantity: 1 }]
        }
      ]
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
    expect(payload.message).toBe("Order validation failed");
  });
});

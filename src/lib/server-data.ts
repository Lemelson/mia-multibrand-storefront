/**
 * Barrel re-export for server-side data access.
 *
 * The implementation is split across modules in ./server-data/:
 *   - storage.ts    — JSON file I/O, data-source resolution
 *   - converters.ts — Prisma ↔ domain type converters
 *   - products.ts   — Product CRUD
 *   - orders.ts     — Order CRUD + idempotency
 *   - stores.ts     — Store & Category access
 */

export {
  getProducts,
  getProductById,
  getProductBySlug,
  createProduct,
  updateProduct,
  deleteProduct
} from "./server-data/products";

export {
  getOrders,
  createOrder,
  createOrderWithIdempotency,
  updateOrderStatus,
  resetOrders,
  getOrderIdempotencyByKey,
  saveOrderIdempotency
} from "./server-data/orders";

export type {
  OrderIdempotencyRecord,
  CreateOrderWithIdempotencyResult
} from "./server-data/orders";

export {
  getStores,
  getStoreById,
  upsertStores,
  getCategories,
  upsertCategories
} from "./server-data/stores";

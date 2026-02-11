import { promises as fs } from "fs";
import path from "path";
import { PrismaClient, type Prisma } from "@prisma/client";
import type { Category, Order, Product, Store } from "../src/lib/types";

const prisma = new PrismaClient();
const DATA_DIR = path.join(process.cwd(), "src/data");

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(DATA_DIR, fileName);
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw) as T;
}

function toProductData(product: Product): Prisma.ProductUncheckedCreateInput {
  return {
    id: product.id,
    sku: product.sku ?? null,
    slug: product.slug,
    name: product.name,
    brand: product.brand,
    description: product.description,
    composition: product.composition,
    care: product.care,
    category: product.category,
    gender: product.gender,
    price: product.price,
    oldPrice: product.oldPrice ?? null,
    colorsJson: product.colors as unknown as Prisma.InputJsonValue,
    storesJson: product.stores as unknown as Prisma.InputJsonValue,
    isNew: product.isNew,
    isActive: product.isActive,
    createdAt: new Date(product.createdAt),
    updatedAt: new Date(product.updatedAt)
  };
}

function toStoreData(store: Store): Prisma.StoreUncheckedCreateInput {
  return {
    id: store.id,
    name: store.name,
    fullName: store.fullName ?? null,
    city: store.city,
    address: store.address,
    phone: store.phone,
    workingHours: store.workingHours,
    coordinatesJson: store.coordinates as Prisma.InputJsonValue,
    whatsapp: store.whatsapp,
    telegram: store.telegram
  };
}

function toCategoryData(category: Category): Prisma.CategoryUncheckedCreateInput {
  return {
    id: category.id,
    slug: category.slug,
    name: category.name,
    gender: category.gender,
    parentId: category.parentId ?? null
  };
}

function toOrderData(order: Order): Prisma.OrderUncheckedCreateInput {
  return {
    id: order.id,
    orderNumber: order.orderNumber,
    itemsJson: order.items as unknown as Prisma.InputJsonValue,
    totalAmount: order.totalAmount,
    customerJson: order.customer as Prisma.InputJsonValue,
    delivery: order.delivery,
    storeId: order.storeId,
    paymentMethod: order.paymentMethod,
    status: order.status,
    createdAt: new Date(order.createdAt),
    updatedAt: new Date(order.updatedAt)
  };
}

async function seedStores(stores: Store[]) {
  for (const store of stores) {
    const data = toStoreData(store);
    await prisma.store.upsert({
      where: { id: store.id },
      create: data,
      update: data
    });
  }
}

async function seedCategories(categories: Category[]) {
  for (const category of categories) {
    const data = toCategoryData(category);
    await prisma.category.upsert({
      where: { id: category.id },
      create: data,
      update: data
    });
  }
}

async function seedProducts(products: Product[]) {
  for (const product of products) {
    const data = toProductData(product);
    await prisma.product.upsert({
      where: { id: product.id },
      create: data,
      update: data
    });
  }
}

async function seedOrders(orders: Order[]) {
  for (const order of orders) {
    const data = toOrderData(order);
    await prisma.order.upsert({
      where: { id: order.id },
      create: data,
      update: data
    });
  }
}

async function main() {
  const [products, stores, categories, orders] = await Promise.all([
    readJson<Product[]>("products.json"),
    readJson<Store[]>("stores.json"),
    readJson<Category[]>("categories.json"),
    readJson<Order[]>("orders.json")
  ]);

  await seedStores(stores);
  await seedCategories(categories);
  await seedProducts(products);
  await seedOrders(orders);

  console.log(`Seeded stores: ${stores.length}`);
  console.log(`Seeded categories: ${categories.length}`);
  console.log(`Seeded products: ${products.length}`);
  console.log(`Seeded orders: ${orders.length}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

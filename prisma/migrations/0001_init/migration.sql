-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('women', 'men', 'kids');

-- CreateEnum
CREATE TYPE "DeliveryType" AS ENUM ('pickup', 'delivery');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('card', 'messenger', 'cash');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('new', 'processing', 'completed', 'cancelled');

-- CreateTable
CREATE TABLE "products" (
    "id" TEXT NOT NULL,
    "sku" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "brand" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "composition" TEXT NOT NULL,
    "care" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "price" INTEGER NOT NULL,
    "old_price" INTEGER,
    "colors_json" JSONB NOT NULL,
    "stores_json" JSONB NOT NULL,
    "is_new" BOOLEAN NOT NULL,
    "is_active" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stores" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "working_hours" TEXT NOT NULL,
    "coordinates_json" JSONB NOT NULL,
    "whatsapp" TEXT NOT NULL,
    "telegram" TEXT NOT NULL,

    CONSTRAINT "stores_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "gender" "Gender" NOT NULL,
    "parent_id" TEXT,

    CONSTRAINT "categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" TEXT NOT NULL,
    "order_number" TEXT NOT NULL,
    "items_json" JSONB NOT NULL,
    "total_amount" INTEGER NOT NULL,
    "customer_json" JSONB NOT NULL,
    "delivery" "DeliveryType" NOT NULL,
    "store_id" TEXT NOT NULL,
    "payment_method" "PaymentMethod" NOT NULL,
    "status" "OrderStatus" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_idempotency" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_idempotency_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "products_sku_key" ON "products"("sku");

-- CreateIndex
CREATE UNIQUE INDEX "products_slug_key" ON "products"("slug");

-- CreateIndex
CREATE INDEX "products_is_active_created_at_idx" ON "products"("is_active", "created_at" DESC);

-- CreateIndex
CREATE INDEX "products_gender_category_is_active_idx" ON "products"("gender", "category", "is_active");

-- CreateIndex
CREATE INDEX "products_colors_json_gin_idx" ON "products" USING GIN ("colors_json");

-- CreateIndex
CREATE INDEX "products_stores_json_gin_idx" ON "products" USING GIN ("stores_json");

-- CreateIndex
CREATE UNIQUE INDEX "categories_slug_key" ON "categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "orders_order_number_key" ON "orders"("order_number");

-- CreateIndex
CREATE INDEX "orders_created_at_idx" ON "orders"("created_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "order_idempotency_key_key" ON "order_idempotency"("key");

-- CreateIndex
CREATE INDEX "order_idempotency_created_at_idx" ON "order_idempotency"("created_at" DESC);

-- AddForeignKey
ALTER TABLE "order_idempotency" ADD CONSTRAINT "order_idempotency_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

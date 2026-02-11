"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { useCart } from "@/components/providers/cart-provider";
import { formatPrice } from "@/lib/format";
import type { Product, Store } from "@/lib/types";
import { ProductCard } from "@/components/product-card";

interface ProductDetailProps {
  product: Product;
  stores: Store[];
  related: Product[];
}

export function ProductDetail({ product, stores, related }: ProductDetailProps) {
  const [selectedColorId, setSelectedColorId] = useState(product.colors[0]?.id ?? "");
  const [selectedSize, setSelectedSize] = useState("");
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [sizeError, setSizeError] = useState(false);
  const [added, setAdded] = useState(false);

  const { addItem } = useCart();

  const selectedColor =
    product.colors.find((color) => color.id === selectedColorId) ?? product.colors[0];

  const availableSizes = selectedColor?.sizes ?? [];
  const activeImage = selectedColor?.images[activeImageIndex] ?? selectedColor?.images[0];

  const alternativeStores = useMemo(() => {
    return product.stores
      .filter((entry) => entry.available)
      .map((entry) => stores.find((store) => store.id === entry.storeId))
      .filter((store): store is Store => Boolean(store));
  }, [product.stores, stores]);

  function handleAddToCart() {
    if (!selectedSize) {
      setSizeError(true);
      return;
    }

    if (!selectedColor) {
      return;
    }

    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      brand: product.brand,
      colorId: selectedColor.id,
      colorName: selectedColor.name,
      size: selectedSize,
      price: product.price,
      imageUrl: selectedColor.images[0] ?? "https://picsum.photos/600/800"
    });

    setAdded(true);
    setSizeError(false);
    setTimeout(() => setAdded(false), 2000);
  }

  return (
    <div className="space-y-10">
      <div className="grid gap-8 xl:grid-cols-[minmax(0,760px)_420px]">
        <div className="grid gap-3 md:grid-cols-[68px_1fr]">
          <div className="order-2 flex gap-2 overflow-auto md:order-1 md:flex-col">
            {selectedColor?.images.map((image, index) => (
              <button
                key={`${image}-${index}`}
                type="button"
                className={`relative h-[86px] w-[68px] shrink-0 overflow-hidden border ${
                  index === activeImageIndex ? "border-text-primary" : "border-border"
                }`}
                onClick={() => setActiveImageIndex(index)}
              >
                <Image src={image} alt={`${product.name} ${index + 1}`} fill sizes="68px" className="object-cover" />
              </button>
            ))}
          </div>

          <div className="order-1 relative aspect-[4/5] overflow-hidden bg-bg-secondary md:order-2">
            {activeImage ? (
              <Image
                src={activeImage}
                alt={product.name}
                fill
                sizes="(max-width: 1280px) 100vw, 760px"
                className="object-contain p-4"
              />
            ) : (
              <div className="h-full w-full bg-bg-secondary" />
            )}
          </div>
        </div>

        <div>
          <Link
            href={`/catalog?brands=${encodeURIComponent(product.brand)}`}
            className="text-[11px] uppercase tracking-[0.08em] text-text-muted"
          >
            {product.brand}
          </Link>
          <h1 className="mt-2 font-logo text-3xl md:text-[40px] md:leading-[1.08]">{product.name}</h1>
          {product.sku ? (
            <p className="mt-2 text-xs uppercase tracking-[0.08em] text-text-muted">Артикул: {product.sku}</p>
          ) : null}
          <p className="mt-4 text-2xl font-medium">{formatPrice(product.price)}</p>

          <div className="mt-6">
            <p className="mb-2 text-sm text-text-secondary">Цвет: {selectedColor?.name}</p>
            <div className="flex gap-2">
              {product.colors.map((color) => (
                <button
                  key={color.id}
                  type="button"
                  title={color.name}
                  onClick={() => {
                    setSelectedColorId(color.id);
                    setActiveImageIndex(0);
                    setSelectedSize("");
                  }}
                  className={`h-5 w-5 rounded-full border ${
                    selectedColorId === color.id ? "border-text-primary" : "border-border"
                  }`}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          </div>

          <div className="mt-6">
            <p className="mb-2 text-sm text-text-secondary">Размер:</p>
            <div className="flex flex-wrap gap-2">
              {availableSizes.map((size) => (
                <button
                  key={size.size}
                  type="button"
                  disabled={!size.inStock}
                  onClick={() => {
                    if (!size.inStock) {
                      return;
                    }
                    setSelectedSize(size.size);
                    setSizeError(false);
                  }}
                  className={`min-w-12 border px-3 py-2 text-xs uppercase tracking-[0.08em] ${
                    !size.inStock
                      ? "cursor-not-allowed border-border text-text-muted opacity-40"
                      : selectedSize === size.size
                        ? "border-text-primary bg-text-primary text-white"
                        : sizeError
                          ? "border-error"
                          : "border-border"
                  }`}
                >
                  {size.size}
                </button>
              ))}
            </div>
            {sizeError && (
              <p className="mt-2 text-sm text-error">Выберите размер</p>
            )}
          </div>

          <button
            type="button"
            className="mt-8 w-full bg-text-primary px-6 py-4 text-xs uppercase tracking-[0.08em] text-white transition hover:opacity-90"
            onClick={handleAddToCart}
          >
            {added ? "✓ Добавлено" : "Добавить в корзину"}
          </button>

          <button type="button" className="mt-3 text-sm text-text-secondary">
            ♡ В избранное
          </button>

          {alternativeStores.length > 0 && (
            <p className="mt-6 text-sm text-text-secondary">
              Также есть в: {alternativeStores.map((store) => `${store.name}, ${store.city}`).join(" · ")}
            </p>
          )}

          <div className="mt-8 divide-y divide-border border-y border-border">
            <Accordion title="Описание" defaultOpen>
              <p>{product.description}</p>
            </Accordion>
            <Accordion title="Состав и уход">
              <p>{product.composition}</p>
              <p className="mt-2">{product.care}</p>
            </Accordion>
            <Accordion title="Доставка и возврат">
              <p>
                Доставка обсуждается с менеджером после оформления заказа. Возврат и обмен доступны в
                соответствии с правилами магазина.
              </p>
            </Accordion>
          </div>
        </div>
      </div>

      {related.length > 0 && (
        <section>
          <h2 className="mb-6 font-logo text-3xl">Вам может понравиться</h2>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {related.map((item) => (
              <ProductCard key={item.id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Accordion({
  title,
  children,
  defaultOpen = false
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center justify-between py-4 text-left text-sm uppercase tracking-[0.08em]"
        onClick={() => setOpen((current) => !current)}
      >
        <span>{title}</span>
        <span>{open ? "▾" : "▸"}</span>
      </button>
      <div
        className={`grid transition-all duration-300 ${open ? "grid-rows-[1fr] pb-4" : "grid-rows-[0fr]"}`}
      >
        <div className="overflow-hidden text-sm leading-6 text-text-secondary">{children}</div>
      </div>
    </div>
  );
}

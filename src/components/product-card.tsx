"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";

interface ProductCardProps {
  product: Product;
}

export function ProductCard({ product }: ProductCardProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const [hovered, setHovered] = useState(false);

  const activeColor = product.colors[0];
  const images = activeColor?.images ?? [];
  const currentImage = images[imageIndex] ?? images[0] ?? "https://picsum.photos/600/800";
  const hasSale = typeof product.oldPrice === "number" && product.oldPrice > product.price;

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!images.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const zoneWidth = rect.width / images.length;
    const nextIndex = Math.max(0, Math.min(images.length - 1, Math.floor(relativeX / zoneWidth)));
    setImageIndex(nextIndex);
  }

  return (
    <article
      className="group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setImageIndex(0);
      }}
    >
      <Link href={`/product/${product.slug}`}>
        <div
          className="relative aspect-[3/4] overflow-hidden bg-bg-secondary"
          onMouseMove={handleMouseMove}
        >
          <Image
            src={currentImage}
            alt={product.name}
            fill
            sizes="(max-width: 768px) 50vw, (max-width: 1280px) 33vw, 25vw"
            className="object-cover transition duration-500"
          />

          {hasSale ? (
            <span className="absolute left-2 top-2 bg-sale px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-white">
              Скидка
            </span>
          ) : product.isNew ? (
            <span className="absolute left-2 top-2 bg-accent px-2 py-1 text-[10px] uppercase tracking-[0.08em] text-white">
              Новинка
            </span>
          ) : null}

          {hovered && images.length > 1 && (
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-1.5">
              {images.map((_, index) => (
                <span
                  key={index}
                  className={`h-[2px] flex-1 rounded-full transition ${
                    index === imageIndex ? "bg-white" : "bg-white/45"
                  }`}
                />
              ))}
            </div>
          )}
        </div>
      </Link>

      <div className="mt-2.5 space-y-1">
        <p className="text-[11px] uppercase tracking-[0.08em] text-text-muted">{product.brand}</p>
        <Link href={`/product/${product.slug}`} className="line-clamp-2 text-[13px] text-text-primary">
          {product.name}
        </Link>
        <div className="flex items-center gap-2 text-[13px]">
          {product.oldPrice && (
            <span className="text-text-muted line-through">{formatPrice(product.oldPrice)}</span>
          )}
          <span className={product.oldPrice ? "text-sale" : "text-text-primary"}>
            {formatPrice(product.price)}
          </span>
        </div>
        <div className="flex gap-1">
          {product.colors.slice(0, 4).map((color) => (
            <span
              key={color.id}
              title={color.name}
              className="inline-block h-2.5 w-2.5 rounded-full border border-border"
              style={{ backgroundColor: color.hex }}
            />
          ))}
        </div>
      </div>
    </article>
  );
}

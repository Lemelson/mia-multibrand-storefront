"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Product } from "@/lib/types";
import { formatPrice } from "@/lib/format";
import { getCatalogImageUrl } from "@/lib/image";

interface ProductCardProps {
  product: Product;
  priority?: boolean;
}

export function ProductCard({ product, priority = false }: ProductCardProps) {
  const [imageIndex, setImageIndex] = useState(0);
  const [hovered, setHovered] = useState(false);
  const preloadedRef = useRef(false);

  const activeColor = product.colors[0];
  const images = useMemo(() => activeColor?.images ?? [], [activeColor?.images]);
  const cardImages = useMemo(() => images.map((image) => getCatalogImageUrl(image)), [images]);
  const currentImage = cardImages[imageIndex] ?? cardImages[0] ?? "https://picsum.photos/600/800";
  const hasSale = typeof product.oldPrice === "number" && product.oldPrice > product.price;
  const discountPercent =
    hasSale && typeof product.oldPrice === "number"
      ? getRoundedDiscountPercent(product.oldPrice, product.price)
      : null;

  function handleMouseMove(event: React.MouseEvent<HTMLDivElement>) {
    if (!images.length) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const relativeX = event.clientX - rect.left;
    const zoneWidth = rect.width / cardImages.length;
    const nextIndex = Math.max(0, Math.min(cardImages.length - 1, Math.floor(relativeX / zoneWidth)));
    setImageIndex(nextIndex);
  }

  const preloadHoverImages = useCallback(() => {
    if (preloadedRef.current || typeof window === "undefined" || cardImages.length < 2) {
      return;
    }

    preloadedRef.current = true;
    const retinaWidth = window.devicePixelRatio > 1.5 ? 828 : 0;

    for (const src of cardImages.slice(1, 5)) {
      const image = new window.Image();
      image.decoding = "async";
      image.src = getNextImageProxyUrl(src, 640, 72);

      if (retinaWidth) {
        const retinaImage = new window.Image();
        retinaImage.decoding = "async";
        retinaImage.src = getNextImageProxyUrl(src, retinaWidth, 72);
      }
    }
  }, [cardImages]);

  useEffect(() => {
    if (!priority || typeof window === "undefined") {
      return;
    }

    const timer = window.setTimeout(() => {
      preloadHoverImages();
    }, 280);

    return () => window.clearTimeout(timer);
  }, [priority, preloadHoverImages]);

  return (
    <article
      className="group"
      onMouseEnter={() => {
        setHovered(true);
        preloadHoverImages();
      }}
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
            priority={priority}
            quality={72}
            sizes="(max-width: 768px) 46vw, (max-width: 1280px) 30vw, 320px"
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

          {hovered && cardImages.length > 1 && (
            <div className="absolute inset-x-3 bottom-3 flex items-center gap-1.5">
              {cardImages.map((_, index) => (
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
        {hasSale && product.oldPrice ? (
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-[11px] tracking-[0.03em] tabular-nums text-text-muted line-through">
                {formatPrice(product.oldPrice)}
              </span>
              <span className="text-[13px] font-medium tracking-[0.035em] tabular-nums text-sale">
                {formatPrice(product.price)}
              </span>
              <div className="flex items-center gap-1">
                {product.colors.slice(0, 4).map((color) => (
                  <span
                    key={color.id}
                    title={color.name}
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: color.hex }}
                  />
                ))}
              </div>
            </div>
            <p className="text-[11px] text-sale">-{discountPercent}%</p>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-medium tracking-[0.035em] tabular-nums text-text-primary">
              {formatPrice(product.price)}
            </span>
            <div className="flex items-center gap-1">
              {product.colors.slice(0, 4).map((color) => (
                <span
                  key={color.id}
                  title={color.name}
                  className="inline-block h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: color.hex }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}

function getRoundedDiscountPercent(oldPrice: number, price: number): number {
  const raw = ((oldPrice - price) / oldPrice) * 100;
  const roundedToFive = Math.round(raw / 5) * 5;
  return Math.max(5, Math.min(95, roundedToFive));
}

function getNextImageProxyUrl(sourceUrl: string, width: number, quality: number): string {
  return `/_next/image?url=${encodeURIComponent(sourceUrl)}&w=${width}&q=${quality}`;
}

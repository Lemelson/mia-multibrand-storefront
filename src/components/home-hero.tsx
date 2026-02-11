"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Container } from "@/components/container";

const HERO_SLIDES = [
  {
    image:
      "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1800&q=80&auto=format&fit=crop",
    badge: "MIA",
    title: "Новая классика",
    description: "Гардероб для путешествий и города",
    ctaLabel: "Смотреть каталог",
    ctaHref: "/catalog"
  },
  {
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1800&q=80&auto=format&fit=crop",
    badge: "Новинки",
    title: "Свежие поступления",
    description: "Женское, мужское и детское в одном пространстве",
    ctaLabel: "Открыть новинки",
    ctaHref: "/catalog?sort=new"
  },
  {
    image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1800&q=80&auto=format&fit=crop",
    badge: "Подборка",
    title: "Сезонные акценты",
    description: "Капсулы, которые легко сочетать между собой",
    ctaLabel: "Выбрать образ",
    ctaHref: "/catalog/women"
  }
];

export function HomeHero() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % HERO_SLIDES.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <section className="relative h-[50vh] overflow-hidden md:h-[70vh]">
      {HERO_SLIDES.map((slide, slideIndex) => {
        const active = slideIndex === index;
        return (
          <div
            key={slide.image}
            className={`absolute inset-0 transition-opacity duration-700 ${
              active ? "opacity-100" : "opacity-0"
            }`}
          >
            <Image
              src={slide.image}
              alt="MIA hero"
              fill
              className="object-cover"
              priority={slideIndex === 0}
              sizes="100vw"
            />
            <div className="absolute inset-0 bg-black/20" />

            <Container className="relative h-full">
              <div className="absolute bottom-10 left-0 max-w-xl text-white md:bottom-14">
                <p className="text-[11px] uppercase tracking-[0.1em] text-white/85">{slide.badge}</p>
                <h2 className="mt-2 font-logo text-4xl leading-tight md:text-[58px]">{slide.title}</h2>
                <p className="mt-3 max-w-lg text-sm leading-6 text-white/90 md:text-base">
                  {slide.description}
                </p>
                <Link
                  href={slide.ctaHref}
                  className="mt-6 inline-block border border-white px-5 py-3 text-xs uppercase tracking-[0.08em] text-white"
                >
                  {slide.ctaLabel}
                </Link>
              </div>
            </Container>
          </div>
        );
      })}
    </section>
  );
}

"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
  const [paused, setPaused] = useState(false);
  const reducedMotionRef = useRef(false);

  useEffect(() => {
    reducedMotionRef.current = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  }, []);

  useEffect(() => {
    if (paused || reducedMotionRef.current) {
      return;
    }

    const timer = window.setInterval(() => {
      setIndex((current) => (current + 1) % HERO_SLIDES.length);
    }, 5000);

    return () => window.clearInterval(timer);
  }, [paused]);

  return (
    <section
      className="relative h-[58vh] overflow-hidden md:h-[72vh]"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      aria-roledescription="carousel"
    >
      {HERO_SLIDES.map((slide, slideIndex) => {
        const active = slideIndex === index;
        return (
          <div
            key={slide.image}
            className={`absolute inset-0 transition-opacity duration-700 ${
              active ? "opacity-100" : "pointer-events-none opacity-0"
            }`}
            aria-hidden={!active}
          >
            <Image
              src={slide.image}
              alt={slide.title}
              fill
              className="object-cover"
              priority={slideIndex === 0}
              sizes="100vw"
            />
            {/* Stronger bottom-up gradient so light slides keep the text legible. */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/25 to-black/5" />

            <div className="absolute inset-0 flex items-end">
              <Container className="w-full pb-12 md:pb-16">
                <div className="max-w-xl text-white">
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/85">{slide.badge}</p>
                  <h2 className="mt-3 font-logo text-4xl leading-[1.05] md:text-[58px]">{slide.title}</h2>
                  <p className="mt-3 max-w-lg text-sm leading-6 text-white/90 md:text-base">
                    {slide.description}
                  </p>
                  <Link
                    href={slide.ctaHref}
                    className="mt-7 inline-block border border-white px-6 py-3 text-xs uppercase tracking-[0.12em] text-white transition hover:bg-white hover:text-text-primary"
                  >
                    {slide.ctaLabel}
                  </Link>
                </div>
              </Container>
            </div>
          </div>
        );
      })}

      {/* Slide controls */}
      <div className="pointer-events-none absolute inset-x-0 bottom-6 md:bottom-8">
        <Container className="flex w-full justify-end">
          <div className="pointer-events-auto flex items-center gap-2.5">
            {HERO_SLIDES.map((slide, slideIndex) => {
              const active = slideIndex === index;
              return (
                <button
                  key={slide.image}
                  type="button"
                  onClick={() => setIndex(slideIndex)}
                  aria-label={`Слайд ${slideIndex + 1}: ${slide.title}`}
                  aria-current={active}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    active ? "w-7 bg-white" : "w-1.5 bg-white/50 hover:bg-white/80"
                  }`}
                />
              );
            })}
          </div>
        </Container>
      </div>
    </section>
  );
}

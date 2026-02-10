"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

const HERO_SLIDES = [
  {
    image:
      "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1800&q=80&auto=format&fit=crop",
    title: "Новая коллекция Весна 2026",
    subtitle: "MIA — ваш стиль, ваш бутик"
  },
  {
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1800&q=80&auto=format&fit=crop",
    title: "Новая классика",
    subtitle: "Гардероб для путешествий и города"
  },
  {
    image:
      "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1800&q=80&auto=format&fit=crop",
    title: "Мультибрендовый бутик в Сочи",
    subtitle: "Женское, мужское и детское"
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
      {HERO_SLIDES.map((slide, slideIndex) => (
        <div
          key={slide.image}
          className={`absolute inset-0 transition-opacity duration-700 ${
            slideIndex === index ? "opacity-100" : "opacity-0"
          }`}
        >
          <Image
            src={slide.image}
            alt={slide.title}
            fill
            className="object-cover"
            priority={slideIndex === 0}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/20" />
          <div className="absolute inset-0 flex items-end px-5 pb-10 md:px-12 md:pb-16">
            <div className="max-w-xl text-white">
              <p className="mb-2 text-xs uppercase tracking-[0.1em]">MIA</p>
              <h1 className="font-logo text-4xl leading-tight md:text-[56px]">{slide.title}</h1>
              <p className="mt-2 text-sm md:text-base">{slide.subtitle}</p>
              <Link
                href="/catalog"
                className="mt-6 inline-block border border-white px-5 py-3 text-xs uppercase tracking-[0.08em] transition hover:bg-white hover:text-black"
              >
                Смотреть каталог
              </Link>
            </div>
          </div>
        </div>
      ))}
    </section>
  );
}

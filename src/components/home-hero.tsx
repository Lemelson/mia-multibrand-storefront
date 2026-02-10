"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

const HERO_SLIDES = [
  {
    image:
      "https://images.unsplash.com/photo-1445205170230-053b83016050?w=1800&q=80&auto=format&fit=crop"
  },
  {
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=1800&q=80&auto=format&fit=crop"
  },
  {
    image: "https://images.unsplash.com/photo-1512436991641-6745cdb1723f?w=1800&q=80&auto=format&fit=crop"
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
            alt="MIA hero"
            fill
            className="object-cover"
            priority={slideIndex === 0}
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/10" />
        </div>
      ))}
    </section>
  );
}

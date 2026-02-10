import Image from "next/image";
import Link from "next/link";
import { Container } from "@/components/container";
import { HomeHero } from "@/components/home-hero";
import { ProductCard } from "@/components/product-card";
import { getProducts } from "@/lib/server-data";

const CATEGORY_CARDS = [
  {
    label: "Женское",
    href: "/catalog/women",
    image:
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?w=900&q=80&auto=format&fit=crop"
  },
  {
    label: "Мужское",
    href: "/catalog/men",
    image:
      "https://images.unsplash.com/photo-1516826957135-700dedea698c?w=900&q=80&auto=format&fit=crop"
  },
  {
    label: "Детское",
    href: "/catalog/kids",
    image:
      "https://images.unsplash.com/photo-1519340241574-2cec6aef0c01?w=900&q=80&auto=format&fit=crop"
  }
];

export default async function HomePage() {
  const products = await getProducts();
  const activeProducts = products.filter((product) => product.isActive);
  const newProducts = [...activeProducts]
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt))
    .slice(0, 8);
  const brands = Array.from(new Set(activeProducts.map((product) => product.brand))).slice(0, 10);

  return (
    <>
      <HomeHero />

      <Container className="mt-12">
        <section>
          <h2 className="mb-6 font-logo text-3xl md:text-[38px]">Категории</h2>
          <div className="grid gap-4 md:grid-cols-3">
            {CATEGORY_CARDS.map((item) => (
              <Link key={item.label} href={item.href} className="group block overflow-hidden">
                <div className="relative aspect-[4/5] overflow-hidden bg-bg-secondary">
                  <Image
                    src={item.image}
                    alt={item.label}
                    fill
                    className="object-cover transition duration-500 group-hover:scale-[1.03]"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <p className="mt-3 text-sm uppercase tracking-[0.08em]">{item.label}</p>
              </Link>
            ))}
          </div>
        </section>

        <section className="mt-16">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-logo text-3xl md:text-[38px]">Новинки</h2>
            <Link href="/catalog?sort=new" className="text-xs uppercase tracking-[0.08em] text-text-secondary">
              Все новинки →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-5">
            {newProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
        </section>

        <section className="mt-16 border-t border-border pt-10">
          <h2 className="mb-6 font-logo text-3xl md:text-[38px]">Наши бренды</h2>
          <div className="flex flex-wrap gap-3 text-sm uppercase tracking-[0.08em] text-text-secondary">
            {brands.map((brand) => (
              <span key={brand} className="border border-border px-3 py-2">
                {brand}
              </span>
            ))}
          </div>
        </section>

        <section className="mt-16 grid gap-6 border-t border-border pt-10 md:grid-cols-2 md:items-center">
          <div className="relative aspect-[4/3] overflow-hidden bg-bg-secondary">
            <Image
              src="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=1200&q=80&auto=format&fit=crop"
              alt="Интерьер магазина"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
            />
          </div>
          <div>
            <h2 className="font-logo text-3xl md:text-[38px]">О магазине</h2>
            <p className="mt-4 max-w-md text-sm leading-6 text-text-secondary">
              Mia — мультибрендовый бутик в Сочи. Мы собрали женские, мужские и детские коллекции,
              которые сочетают комфорт, качество и современный силуэт.
            </p>
            <Link
              href="/contacts"
              className="mt-6 inline-block border border-text-primary px-5 py-3 text-xs uppercase tracking-[0.08em]"
            >
              Подробнее
            </Link>
          </div>
        </section>
      </Container>
    </>
  );
}

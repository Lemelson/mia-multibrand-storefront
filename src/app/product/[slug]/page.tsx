import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { Container } from "@/components/container";
import { ProductDetail } from "@/components/product-detail";
import { getCategories, getProductBySlug, getProducts, getStores } from "@/lib/server-data";

export async function generateMetadata({
  params
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const product = await getProductBySlug(params.slug);

  if (!product) {
    return {
      title: "Товар не найден | MIA"
    };
  }

  const firstImage = product.colors[0]?.images[0];

  return {
    title: `${product.name} | MIA`,
    description: `${product.brand}. ${product.description}`.slice(0, 160),
    openGraph: {
      title: `${product.name} | MIA`,
      description: `${product.brand}. ${product.description}`.slice(0, 160),
      images: firstImage ? [firstImage] : []
    }
  };
}

export default async function ProductPage({
  params
}: {
  params: { slug: string };
}) {
  const product = await getProductBySlug(params.slug);

  if (!product || !product.isActive) {
    notFound();
  }

  const [products, stores, categories] = await Promise.all([
    getProducts(),
    getStores(),
    getCategories()
  ]);

  const category = categories.find((item) => item.slug === product.category);
  const genderTitle =
    product.gender === "women" ? "Женское" : product.gender === "men" ? "Мужское" : "Детское";

  const related = products
    .filter(
      (item) =>
        item.id !== product.id &&
        item.isActive &&
        (item.category === product.category || item.gender === product.gender)
    )
    .slice(0, 8);

  return (
    <Container className="py-6 md:py-8">
      <Breadcrumbs
        items={[
          { label: "Главная", href: "/" },
          { label: genderTitle, href: `/catalog/${product.gender}` },
          ...(category ? [{ label: category.name, href: `/catalog/${category.slug}` }] : []),
          { label: product.name }
        ]}
      />
      <ProductDetail product={product} stores={stores} related={related} />
    </Container>
  );
}

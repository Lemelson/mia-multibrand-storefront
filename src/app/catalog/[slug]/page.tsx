import { notFound } from "next/navigation";
import { Container } from "@/components/container";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogView } from "@/components/catalog-view";
import { getCategories } from "@/lib/server-data";

const GENDER_TITLES: Record<string, string> = {
  women: "Женское",
  men: "Мужское",
  kids: "Детское"
};

export default async function CatalogSegmentPage({
  params
}: {
  params: { slug: string };
}) {
  const { slug } = params;

  if (slug in GENDER_TITLES) {
    const title = GENDER_TITLES[slug];

    return (
      <Container className="py-6 md:py-8">
        <Breadcrumbs
          items={[
            { label: "Главная", href: "/" },
            { label: "Каталог", href: "/catalog" },
            { label: title }
          ]}
        />
        <CatalogView title={title} gender={slug} />
      </Container>
    );
  }

  const categories = await getCategories();
  const category = categories.find((item) => item.slug === slug);

  if (!category) {
    notFound();
  }

  const genderTitle = GENDER_TITLES[category.gender];

  return (
    <Container className="py-6 md:py-8">
      <Breadcrumbs
        items={[
          { label: "Главная", href: "/" },
          { label: "Каталог", href: "/catalog" },
          { label: genderTitle, href: `/catalog/${category.gender}` },
          { label: category.name }
        ]}
      />
      <CatalogView title={category.name} gender={category.gender} category={category.slug} />
    </Container>
  );
}

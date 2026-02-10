import { Container } from "@/components/container";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogView } from "@/components/catalog-view";
import { getCategories } from "@/lib/server-data";

export default async function CatalogPage() {
  const categories = await getCategories();

  return (
    <Container className="py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Каталог" }]} />
      <CatalogView title="Каталог" sidebarCategories={categories} />
    </Container>
  );
}

import { Container } from "@/components/container";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { CatalogView } from "@/components/catalog-view";

export default function CatalogPage() {
  return (
    <Container className="py-6 md:py-8">
      <Breadcrumbs items={[{ label: "Главная", href: "/" }, { label: "Каталог" }]} />
      <CatalogView title="Каталог" />
    </Container>
  );
}

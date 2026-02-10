import Link from "next/link";
import { Container } from "@/components/container";

export default function NotFoundPage() {
  return (
    <Container>
      <section className="py-16 text-center">
        <h1 className="font-logo text-4xl">Страница не найдена</h1>
        <p className="mt-3 text-sm text-text-secondary">Проверьте адрес или вернитесь в каталог.</p>
        <Link href="/catalog" className="mt-6 inline-block border border-text-primary px-6 py-3 text-xs uppercase tracking-[0.08em]">
          В каталог
        </Link>
      </section>
    </Container>
  );
}

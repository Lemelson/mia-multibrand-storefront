import Link from "next/link";
import type { Store } from "@/lib/types";
import { Container } from "@/components/container";

interface SiteFooterProps {
  stores: Store[];
}

export function SiteFooter({ stores }: SiteFooterProps) {
  return (
    <footer className="mt-16 border-t border-border bg-bg-secondary py-12">
      <Container>
        <div className="grid gap-8 md:grid-cols-4">
          <div>
            <p className="font-logo text-3xl">MIA</p>
            <p className="mt-3 text-sm text-text-secondary">© 2026 Mia. Все права защищены.</p>
          </div>

          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.1em] text-text-muted">Каталог</p>
            <div className="space-y-2 text-sm">
              <Link href="/catalog/women" className="block">Женское</Link>
              <Link href="/catalog/men" className="block">Мужское</Link>
              <Link href="/catalog/kids" className="block">Детское</Link>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.1em] text-text-muted">Информация</p>
            <div className="space-y-2 text-sm">
              <Link href="/delivery" className="block">Доставка и возврат</Link>
              <Link href="/contacts" className="block">Контакты</Link>
              <Link href="/privacy" className="block">Политика ПДн</Link>
              <Link href="/offer" className="block">Оферта</Link>
              <Link href="/consent" className="block">Согласие ПДн</Link>
              <Link href="/admin" className="block">Админка</Link>
            </div>
          </div>

          <div>
            <p className="mb-3 text-xs uppercase tracking-[0.1em] text-text-muted">Магазины</p>
            <div className="space-y-3 text-sm text-text-secondary">
              {stores.map((store) => (
                <p key={store.id}>
                  <strong className="text-text-primary">{store.name}</strong><br />
                  {store.address}
                </p>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </footer>
  );
}

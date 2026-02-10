import Link from "next/link";
import { Container } from "@/components/container";
import { formatPrice } from "@/lib/format";

export default function CheckoutSuccessPage({
  searchParams
}: {
  searchParams: {
    orderNumber?: string;
    delivery?: string;
    payment?: string;
    total?: string;
    messenger?: string;
  };
}) {
  const orderNumber = searchParams.orderNumber ?? "MIA-2026-0000";
  const delivery = searchParams.delivery === "delivery" ? "Доставка" : "Самовывоз";
  const payment =
    searchParams.payment === "messenger"
      ? "Связаться для оплаты"
      : searchParams.payment === "cash"
        ? "Оплата при получении"
        : "Оплата картой";

  const total = Number(searchParams.total ?? 0);
  const message = searchParams.messenger ?? `Здравствуйте! Заказ ${orderNumber}`;

  return (
    <Container>
      <section className="py-16">
        <div className="mx-auto max-w-2xl border border-border bg-bg-secondary p-8 text-center">
          <p className="text-5xl">✓</p>
          <h1 className="mt-3 font-logo text-4xl">Спасибо за заказ!</h1>
          <p className="mt-3 text-sm text-text-secondary">Номер заказа: {orderNumber}</p>

          <div className="mx-auto mt-8 max-w-md space-y-2 border-t border-border pt-6 text-left text-sm">
            <p>
              <strong>Способ получения:</strong> {delivery}
            </p>
            <p>
              <strong>Оплата:</strong> {payment}
            </p>
            <p>
              <strong>Сумма:</strong> {formatPrice(total)}
            </p>
          </div>

          <div className="mt-8 grid gap-3 md:grid-cols-2">
            <Link
              href={`https://wa.me/?text=${encodeURIComponent(message)}`}
              className="border border-text-primary px-4 py-3 text-xs uppercase tracking-[0.08em]"
              target="_blank"
            >
              Написать в WhatsApp
            </Link>
            <Link
              href={`https://t.me/share/url?url=${encodeURIComponent("https://mia.local")}&text=${encodeURIComponent(message)}`}
              className="border border-text-primary px-4 py-3 text-xs uppercase tracking-[0.08em]"
              target="_blank"
            >
              Написать в Telegram
            </Link>
          </div>

          <Link href="/catalog" className="mt-6 inline-block text-sm text-text-secondary">
            Вернуться в каталог
          </Link>
        </div>
      </section>
    </Container>
  );
}

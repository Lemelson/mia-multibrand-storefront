import Link from "next/link";
import { Container } from "@/components/container";
import { getStores } from "@/lib/server-data";

export default async function ContactsPage() {
  const stores = await getStores();

  return (
    <Container className="py-6 md:py-8">
      <h1 className="font-logo text-3xl md:text-[42px]">Контакты</h1>

      <div className="mt-8 grid gap-6 md:grid-cols-3">
        {stores.map((store) => (
          <article key={store.id} className="border border-border p-5">
            <h2 className="font-logo text-2xl">{store.name}</h2>
            <p className="mt-2 text-sm text-text-secondary">{store.city}</p>
            <p className="mt-3 text-sm">{store.address}</p>
            <p className="mt-2 text-sm">{store.workingHours}</p>
            <p className="mt-2 text-sm">{store.phone}</p>
          </article>
        ))}
      </div>

      <section className="mt-10 border border-border bg-bg-secondary p-6">
        <h2 className="font-logo text-2xl">Карта</h2>
        <p className="mt-3 text-sm text-text-secondary">
          Плейсхолдер карты для MVP. Позже подключим Яндекс.Карты или 2GIS с тремя точками магазинов.
        </p>
        <div className="mt-4 h-72 border border-dashed border-border bg-white/60" />
      </section>

      <section className="mt-10 border border-border p-6">
        <h2 className="font-logo text-2xl">Обратная связь</h2>
        <form className="mt-5 grid gap-4 md:max-w-xl">
          <input className="border border-border px-3 py-3" placeholder="Имя" />
          <input className="border border-border px-3 py-3" placeholder="Телефон" />
          <textarea className="min-h-[140px] border border-border px-3 py-3" placeholder="Сообщение" />
          <button type="button" className="w-fit border border-text-primary px-6 py-3 text-xs uppercase tracking-[0.08em]">
            Отправить
          </button>
        </form>
      </section>

      <div className="mt-8 flex flex-wrap gap-4 text-sm text-text-secondary">
        <Link href="https://instagram.com" target="_blank">Instagram</Link>
        <Link href="https://t.me" target="_blank">Telegram</Link>
      </div>
    </Container>
  );
}

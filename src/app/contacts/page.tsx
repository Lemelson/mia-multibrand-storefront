import Link from "next/link";
import { MessageCircle, Navigation, Phone, Send } from "lucide-react";
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
            <h2 className="font-logo text-2xl">{store.fullName ?? store.name}</h2>
            <p className="mt-2 text-sm text-text-secondary">{store.city}</p>
            <p className="mt-3 text-sm">{store.address}</p>
            <p className="mt-2 text-sm">{store.workingHours}</p>
            <p className="mt-2 text-sm">{store.phone}</p>

            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href={getTelegramUrl(store.telegram)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-xs uppercase tracking-[0.08em]"
              >
                <Send size={13} />
                Telegram
              </Link>
              <Link
                href={getWhatsAppUrl(store.whatsapp)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-xs uppercase tracking-[0.08em]"
              >
                <MessageCircle size={13} />
                WhatsApp
              </Link>
              <Link
                href={getYandexMapsUrl(store.coordinates.lat, store.coordinates.lng)}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 border border-border px-2.5 py-1.5 text-xs uppercase tracking-[0.08em]"
              >
                <Navigation size={13} />
                На карте
              </Link>
            </div>
          </article>
        ))}
      </div>

      <section className="mt-10 border border-border bg-bg-secondary p-6">
        <h2 className="font-logo text-2xl">Карта</h2>
        <p className="mt-3 text-sm text-text-secondary">
          Временный режим: кнопки «На карте» открывают точки в Яндекс.Картах. Далее можно подключить
          интерактивную карту Яндекс с метками всех магазинов.
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
        <Link href="https://t.me/ModaMia_sochi" target="_blank">Telegram MIA</Link>
        <Link href="https://t.me/twinset_kp" target="_blank">Telegram Twinset Поляна</Link>
        <Link href="https://wa.me/79388731838" target="_blank" className="inline-flex items-center gap-1.5">
          <Phone size={14} />
          WhatsApp
        </Link>
      </div>
    </Container>
  );
}

function getTelegramUrl(value: string): string {
  if (/^https?:\/\//i.test(value)) {
    return value;
  }

  return `https://t.me/${value.replace(/^@/, "")}`;
}

function getWhatsAppUrl(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `https://wa.me/${digits}`;
}

function getYandexMapsUrl(lat: number, lng: number): string {
  return `https://yandex.ru/maps/?pt=${lng},${lat}&z=16&l=map`;
}

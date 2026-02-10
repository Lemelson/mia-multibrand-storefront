import { Container } from "@/components/container";

export default function DeliveryPage() {
  return (
    <Container className="py-6 md:py-8">
      <h1 className="font-logo text-3xl md:text-[42px]">Доставка и возврат</h1>

      <div className="mt-8 space-y-6 text-sm leading-7 text-text-secondary">
        <section className="border border-border p-6">
          <h2 className="mb-3 font-logo text-2xl text-text-primary">Способы доставки</h2>
          <p>
            На этапе MVP мы предлагаем самовывоз из выбранного магазина и доставку по согласованию с
            менеджером. После оформления заказа менеджер уточняет детали и сроки.
          </p>
        </section>

        <section className="border border-border p-6">
          <h2 className="mb-3 font-logo text-2xl text-text-primary">Сроки и стоимость</h2>
          <p>
            Самовывоз возможен в рабочие часы магазина. Стоимость и срок доставки рассчитываются
            индивидуально в зависимости от адреса и состава заказа.
          </p>
        </section>

        <section className="border border-border p-6">
          <h2 className="mb-3 font-logo text-2xl text-text-primary">Условия возврата и обмена</h2>
          <p>
            Возврат и обмен возможны при сохранении товарного вида и документов, подтверждающих
            покупку, в сроки, предусмотренные действующим законодательством РФ и правилами магазина.
          </p>
        </section>

        <section className="border border-border p-6">
          <h2 className="mb-3 font-logo text-2xl text-text-primary">Юридическая информация</h2>
          <p>
            Разделы «Политика обработки персональных данных», «Публичная оферта» и согласие на
            обработку ПДн добавлены как плейсхолдеры и будут дополнены финальным юридическим текстом.
          </p>
        </section>
      </div>
    </Container>
  );
}

"use client";

import { formatDate, formatPrice } from "@/lib/format";
import type { Order, OrderStatus } from "@/lib/types";

interface AdminOrderListProps {
  orders: Order[];
  onUpdateStatus: (orderId: string, status: OrderStatus) => void;
}

export function AdminOrderList({ orders, onUpdateStatus }: AdminOrderListProps) {
  return (
    <div className="space-y-3">
      {orders.length === 0 && (
        <div className="border border-border bg-bg-secondary px-5 py-8 text-sm text-text-secondary">
          Заказов пока нет.
        </div>
      )}

      {orders.map((order) => (
        <article key={order.id} className="border border-border p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium">{order.orderNumber}</h3>
              <p className="text-xs text-text-secondary">{formatDate(order.createdAt)}</p>
            </div>
            <select
              value={order.status}
              onChange={(event) => onUpdateStatus(order.id, event.target.value as OrderStatus)}
              className="border border-border px-3 py-2 text-xs uppercase tracking-[0.08em]"
            >
              <option value="new">Новый</option>
              <option value="processing">В обработке</option>
              <option value="completed">Завершен</option>
              <option value="cancelled">Отменен</option>
            </select>
          </div>

          <p className="mt-3 text-sm">
            {order.customer.name} · {order.customer.phone}
          </p>
          <p className="text-sm text-text-secondary">
            {order.delivery === "pickup" ? "Самовывоз" : "Доставка"} · {order.paymentMethod}
          </p>

          <div className="mt-3 space-y-2 text-sm">
            {order.items.map((item, index) => (
              <p key={`${item.productId}-${index}`}>
                {item.name} ({item.color}, {item.size}) × {item.quantity}
              </p>
            ))}
          </div>

          <p className="mt-4 text-sm font-medium">Итого: {formatPrice(order.totalAmount)}</p>
        </article>
      ))}
    </div>
  );
}

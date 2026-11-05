// Тестовые фикстуры для агрегаторов: доменные заказы и остатки, собранные
// вручную, чтобы ожидаемые числа в тестах можно было посчитать на бумаге.
// Не импортируется кодом приложения.
import type { Order, StockRow } from '../domain'

type ProductFields = Partial<
  Pick<Order, 'marketplace' | 'scheme' | 'sku' | 'offerId' | 'name' | 'category' | 'warehouse' | 'orderedAt'>
>

type CommonFields = ProductFields & {
  id: string
  orderDate: string
  price: number
  costPrice?: number
}

function baseOrder(p: CommonFields): Order {
  return {
    id: p.id,
    marketplace: p.marketplace ?? 'wb',
    scheme: p.scheme ?? null,
    sku: p.sku ?? 'SKU-1',
    offerId: p.offerId ?? 'ART-1',
    name: p.name ?? 'Товар 1',
    category: p.category ?? 'clothing',
    warehouse: p.warehouse ?? 'Коледино',
    // Полдень по Москве — день заказа однозначен
    orderedAt: p.orderedAt ?? `${p.orderDate}T12:00:00+03:00`,
    orderDate: p.orderDate,
    price: p.price,
    outcome: 'inTransit',
    boughtOn: null,
    cancelledOn: null,
    returnedOn: null,
    commission: 0,
    commissionRefund: 0,
    costPrice: p.costPrice ?? 0,
    logistics: [],
  }
}

/** Заказ ещё в пути: ни выкупа, ни отмены, ни денег. */
export function inTransitOrder(p: CommonFields): Order {
  return baseOrder(p)
}

/** Выкуплен и не возвращён: доставка к покупателю списана в день выкупа. */
export function boughtOrder(
  p: CommonFields & { boughtOn: string; commission: number; delivery: number; costPrice: number },
): Order {
  return {
    ...baseOrder(p),
    outcome: 'bought',
    boughtOn: p.boughtOn,
    commission: p.commission,
    logistics: p.delivery > 0 ? [{ date: p.boughtOn, amount: p.delivery }] : [],
  }
}

/**
 * Выкуплен, затем возвращён: комиссия возвращается продавцу,
 * доставка к покупателю — в день выкупа, обратная — в день возврата.
 */
export function returnedOrder(
  p: CommonFields & {
    boughtOn: string
    returnedOn: string
    commission: number
    delivery: number
    returnDelivery: number
    costPrice: number
  },
): Order {
  return {
    ...baseOrder(p),
    outcome: 'returned',
    boughtOn: p.boughtOn,
    returnedOn: p.returnedOn,
    commission: p.commission,
    commissionRefund: p.commission,
    logistics: [
      { date: p.boughtOn, amount: p.delivery },
      { date: p.returnedOn, amount: p.returnDelivery },
    ],
  }
}

/** Отмена до отправки: логистики нет. */
export function cancelledBeforeShipOrder(p: CommonFields & { cancelledOn: string }): Order {
  return { ...baseOrder(p), outcome: 'cancelled', cancelledOn: p.cancelledOn }
}

/**
 * Отмена после отправки (отказ при получении, не забрал в срок):
 * доставка к покупателю и обратная доставка — обе в день отмены.
 */
export function cancelledAfterShipOrder(
  p: CommonFields & { cancelledOn: string; delivery: number; returnDelivery: number },
): Order {
  return {
    ...baseOrder(p),
    outcome: 'cancelled',
    cancelledOn: p.cancelledOn,
    logistics: [
      { date: p.cancelledOn, amount: p.delivery },
      { date: p.cancelledOn, amount: p.returnDelivery },
    ],
  }
}

export function stockRow(
  p: Partial<StockRow> & Pick<StockRow, 'sku' | 'warehouse' | 'stock'>,
): StockRow {
  return {
    sku: p.sku,
    offerId: p.offerId ?? `ART-${p.sku}`,
    name: p.name ?? `Товар ${p.sku}`,
    category: p.category ?? 'clothing',
    marketplace: p.marketplace ?? 'wb',
    scheme: p.scheme ?? null,
    warehouse: p.warehouse,
    stock: p.stock,
  }
}

/** Пустой день ряда продаж. */
export const ZERO_DAY = { revenue: 0, ordersCount: 0, profit: 0 } as const

/** Все ключи Metrics из контракта spec 001. */
export const METRIC_KEYS = [
  'ordersCount',
  'ordersSum',
  'buyoutsCount',
  'revenue',
  'buyoutRate',
  'returnsCount',
  'returnsSum',
  'avgCheck',
  'commission',
  'logistics',
  'costPrice',
  'profit',
  'margin',
] as const

/** Пример с курткой из docs/domain.md: заказ 1.10, выкуп 4.10, возврат 10.10. */
export function jacketOrder(id = 'jacket-1'): Order {
  return returnedOrder({
    id,
    sku: 'JACKET',
    name: 'Куртка',
    orderDate: '2026-10-01',
    boughtOn: '2026-10-04',
    returnedOn: '2026-10-10',
    price: 5000,
    commission: 1250,
    delivery: 80,
    returnDelivery: 80,
    costPrice: 2000,
  })
}

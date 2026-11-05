import type { Filters, Marketplace, Order, Outcome, Scheme } from '../domain'
import { matchesFilters } from './metrics'

export type OrdersQuery = Filters & {
  q?: string
  status?: Outcome
  sort?: 'date' | 'price'
  dir?: 'asc' | 'desc'
  offset?: number
  limit?: number
}

export type OrderItem = {
  id: string
  orderedAt: string
  sku: string
  offerId: string
  name: string
  marketplace: Marketplace
  scheme: Scheme | null
  warehouse: string
  price: number
  status: Outcome
}

export type OrdersResponse = {
  total: number
  counts: Record<'all' | Outcome, number>
  items: OrderItem[]
}

const DEFAULT_LIMIT = 50

/** /api/orders: страница заказов периода (по дате заказа) с поиском и счётчиками (AC-22). */
export function ordersPage(orders: readonly Order[], query: OrdersQuery): OrdersResponse {
  const needle = query.q?.trim().toLowerCase() ?? ''
  const found = orders.filter(
    (o) =>
      o.orderDate >= query.from &&
      o.orderDate <= query.to &&
      matchesFilters(o, query) &&
      (needle === '' || [o.name, o.offerId, o.sku, o.id].some((field) => field.toLowerCase().includes(needle))),
  )

  // Счётчики — по поиску и фильтрам, но без выбранного статуса: чипы показывают, сколько будет после клика
  const counts: OrdersResponse['counts'] = { all: found.length, inTransit: 0, bought: 0, cancelled: 0, returned: 0 }
  for (const o of found) counts[o.outcome] += 1

  const selected = query.status ? found.filter((o) => o.outcome === query.status) : found
  const sort = query.sort ?? 'date'
  const sign = (query.dir ?? 'desc') === 'desc' ? -1 : 1
  const keyed = selected.map((o) => ({ o, key: sort === 'date' ? Date.parse(o.orderedAt) : o.price }))
  keyed.sort((a, b) => sign * (a.key - b.key) || a.o.id.localeCompare(b.o.id))

  const offset = query.offset ?? 0
  const limit = query.limit ?? DEFAULT_LIMIT
  return {
    total: selected.length,
    counts,
    items: keyed.slice(offset, offset + limit).map(({ o }) => ({
      id: o.id,
      orderedAt: o.orderedAt,
      sku: o.sku,
      offerId: o.offerId,
      name: o.name,
      marketplace: o.marketplace,
      scheme: o.scheme,
      warehouse: o.warehouse,
      price: o.price,
      status: o.outcome,
    })),
  }
}

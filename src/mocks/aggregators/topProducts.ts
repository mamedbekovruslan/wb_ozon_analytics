import type { CategoryId, Filters, Marketplace, Order } from '../domain'
import { accumulateOrder, emptyAccumulator, finalize, matchesFilters, type Accumulator } from './metrics'

export type TopSort = 'revenue' | 'orders' | 'buyoutRate' | 'profit'

export type TopProductItem = {
  sku: string
  name: string
  offerId: string
  marketplace: Marketplace
  category: CategoryId
  revenue: number
  ordersCount: number
  buyoutRate: number | null
  profit: number
}

export type TopProductsResponse = { items: TopProductItem[] }

const SORT_FIELD = { revenue: 'revenue', orders: 'ordersCount', buyoutRate: 'buyoutRate', profit: 'profit' } as const satisfies Record<TopSort, keyof TopProductItem>

/** /api/top-products: N товаров с наибольшим значением метрики за период (AC-19). */
export function topProducts(orders: readonly Order[], filters: Filters, { sort = 'revenue', limit = 10 }: { sort?: TopSort; limit?: number } = {}): TopProductsResponse {
  const bySku = new Map<string, { order: Order; acc: Accumulator; touched: boolean }>()

  for (const order of orders) {
    if (!matchesFilters(order, filters)) continue
    let entry = bySku.get(order.sku)
    if (!entry) {
      entry = { order, acc: emptyAccumulator(), touched: false }
      bySku.set(order.sku, entry)
    }
    const current = entry
    accumulateOrder(order, (date) => {
      if (date < filters.from || date > filters.to) return []
      current.touched = true
      return [current.acc]
    })
  }

  const items: TopProductItem[] = []
  for (const { order, acc, touched } of bySku.values()) {
    if (!touched) continue
    const m = finalize(acc)
    items.push({
      sku: order.sku,
      name: order.name,
      offerId: order.offerId,
      marketplace: order.marketplace,
      category: order.category,
      revenue: m.revenue,
      ordersCount: m.ordersCount,
      buyoutRate: m.buyoutRate,
      profit: m.profit,
    })
  }

  const field = SORT_FIELD[sort]
  items.sort((a, b) => {
    const av = a[field]
    const bv = b[field]
    // Нет значения (например, % выкупа без завершённых заказов) — в конец
    if (av === null || bv === null) return av === bv ? a.sku.localeCompare(b.sku) : av === null ? 1 : -1
    return bv - av || a.sku.localeCompare(b.sku)
  })
  return { items: items.slice(0, limit) }
}

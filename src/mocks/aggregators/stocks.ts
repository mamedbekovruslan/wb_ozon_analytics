import type { CategoryId, Filters, Marketplace, Order, Scheme, StockRow } from '../domain'
import { addDays } from '../lib/dates'
import { round2 } from '../lib/money'
import { matchesFilters } from './metrics'

export type StockStatus = 'critical' | 'soon' | 'ok' | 'noSales'

export type StockItem = {
  sku: string
  name: string
  offerId: string
  marketplace: Marketplace
  scheme: Scheme | null
  warehouse: string
  category: CategoryId
  stock: number
  perDay: number
  days: number | null
  status: StockStatus
}

export type StocksResponse = {
  asOf: string
  total: number
  counts: Record<StockStatus, number>
  items: StockItem[]
}

const SPEED_WINDOW_DAYS = 14

/** критично < 7 · скоро закончится 7–14 · норма > 14 · нет продаж (docs/domain.md). */
function statusOf(days: number | null): StockStatus {
  if (days === null) return 'noSales'
  if (days < 7) return 'critical'
  if (days <= 14) return 'soon'
  return 'ok'
}

/** /api/stocks: остатки на «сегодня» по парам «товар × склад» (AC-20, AC-21). */
export function stocks(
  rows: readonly StockRow[],
  orders: readonly Order[],
  options: Pick<Filters, 'mp' | 'cat'> & { today: string; status?: StockStatus; limit?: number },
): StocksResponse {
  // Скорость: выкупы за 14 дней включая «сегодня» / 14
  const windowFrom = addDays(options.today, -(SPEED_WINDOW_DAYS - 1))
  const sold = new Map<string, number>()
  for (const o of orders) {
    if (o.boughtOn === null || o.boughtOn < windowFrom || o.boughtOn > options.today) continue
    const key = `${o.sku}|${o.warehouse}`
    sold.set(key, (sold.get(key) ?? 0) + 1)
  }

  const items: StockItem[] = rows
    .filter((row) => matchesFilters(row, options))
    .map((row) => {
      const perDay = (sold.get(`${row.sku}|${row.warehouse}`) ?? 0) / SPEED_WINDOW_DAYS
      const days = perDay > 0 ? row.stock / perDay : null
      return {
        sku: row.sku,
        name: row.name,
        offerId: row.offerId,
        marketplace: row.marketplace,
        scheme: row.scheme,
        warehouse: row.warehouse,
        category: row.category,
        stock: row.stock,
        perDay,
        days: days === null ? null : round2(days),
        status: statusOf(days),
      }
    })

  // По дням запаса по возрастанию, «нет продаж» — в конце
  items.sort((a, b) => {
    if (a.days === null || b.days === null) {
      if (a.days === b.days) return `${a.sku}|${a.warehouse}`.localeCompare(`${b.sku}|${b.warehouse}`)
      return a.days === null ? 1 : -1
    }
    return a.days - b.days || `${a.sku}|${a.warehouse}`.localeCompare(`${b.sku}|${b.warehouse}`)
  })

  const counts: Record<StockStatus, number> = { critical: 0, soon: 0, ok: 0, noSales: 0 }
  for (const item of items) counts[item.status] += 1

  const selected = options.status ? items.filter((i) => i.status === options.status) : items
  return {
    asOf: options.today,
    total: selected.length,
    counts,
    items: options.limit === undefined ? selected : selected.slice(0, options.limit),
  }
}

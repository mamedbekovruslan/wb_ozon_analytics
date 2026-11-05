import type { Filters, Order } from '../domain'
import { round2 } from '../lib/money'

// Метрики по docs/domain.md, «Два правила учёта»: деньги и счётчики событий —
// в день события, % выкупа — по итогу заказов, оформленных в периоде.
// Считаем через аддитивные «накопители»: их можно складывать по дням,
// отрезкам sparkline и площадкам, а доли вычислять в самом конце.

export type Metrics = {
  ordersCount: number
  ordersSum: number
  buyoutsCount: number
  revenue: number
  buyoutRate: number | null
  returnsCount: number
  returnsSum: number
  avgCheck: number | null
  commission: number
  logistics: number
  costPrice: number
  profit: number
  margin: number | null
}

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
] as const satisfies readonly (keyof Metrics)[]

export type Accumulator = {
  ordersCount: number
  ordersSum: number
  /** Заказы периода с итогом (не «в пути») — знаменатель % выкупа */
  completed: number
  /** Заказы периода с итогом «выкуплен» — числитель % выкупа */
  kept: number
  buyoutsCount: number
  /** Σ цен выкупов без вычета возвратов */
  grossSales: number
  returnsCount: number
  returnsSum: number
  commission: number
  logistics: number
  costPrice: number
}

export function emptyAccumulator(): Accumulator {
  return { ordersCount: 0, ordersSum: 0, completed: 0, kept: 0, buyoutsCount: 0, grossSales: 0, returnsCount: 0, returnsSum: 0, commission: 0, logistics: 0, costPrice: 0 }
}

export function mergeAccumulators(target: Accumulator, source: Accumulator): Accumulator {
  for (const key of Object.keys(target) as (keyof Accumulator)[]) target[key] += source[key]
  return target
}

export function finalize(acc: Accumulator): Metrics {
  const revenue = round2(acc.grossSales - acc.returnsSum)
  const commission = round2(acc.commission)
  const logistics = round2(acc.logistics)
  const costPrice = round2(acc.costPrice)
  const profit = round2(revenue - commission - logistics - costPrice)
  return {
    ordersCount: acc.ordersCount,
    ordersSum: round2(acc.ordersSum),
    buyoutsCount: acc.buyoutsCount,
    revenue,
    buyoutRate: acc.completed > 0 ? (acc.kept / acc.completed) * 100 : null,
    returnsCount: acc.returnsCount,
    returnsSum: round2(acc.returnsSum),
    avgCheck: acc.buyoutsCount > 0 ? acc.grossSales / acc.buyoutsCount : null,
    commission,
    logistics,
    costPrice,
    profit,
    // При выручке ≤ 0 маржа теряет смысл (docs/domain.md)
    margin: revenue > 0 ? (profit / revenue) * 100 : null,
  }
}

export function matchesFilters(order: { marketplace: string; category: string }, filters: Pick<Filters, 'mp' | 'cat'>): boolean {
  if (filters.mp !== 'all' && order.marketplace !== filters.mp) return false
  return filters.cat.length === 0 || (filters.cat as readonly string[]).includes(order.category)
}

/**
 * Раскладывает события заказа по накопителям. `targets(date)` возвращает
 * накопители, в которые попадает день (пустой список — день вне интереса).
 */
export function accumulateOrder(order: Order, targets: (date: string) => readonly Accumulator[]): void {
  for (const acc of targets(order.orderDate)) {
    acc.ordersCount += 1
    acc.ordersSum += order.price
    if (order.outcome !== 'inTransit') acc.completed += 1
    if (order.outcome === 'bought') acc.kept += 1
  }
  if (order.boughtOn !== null) {
    for (const acc of targets(order.boughtOn)) {
      acc.buyoutsCount += 1
      acc.grossSales += order.price
      acc.commission += order.commission
      acc.costPrice += order.costPrice
    }
  }
  if (order.returnedOn !== null) {
    // При возврате площадка возвращает комиссию, товар снова на складе
    for (const acc of targets(order.returnedOn)) {
      acc.returnsCount += 1
      acc.returnsSum += order.price
      acc.commission -= order.commissionRefund
      acc.costPrice -= order.costPrice
    }
  }
  for (const charge of order.logistics) {
    for (const acc of targets(charge.date)) acc.logistics += charge.amount
  }
}

import type { Filters, Order } from '../domain'
import { addDays } from '../lib/dates'
import { accumulateOrder, emptyAccumulator, finalize, matchesFilters, mergeAccumulators, type Accumulator } from './metrics'
import { eachDay, previousPeriod } from './period'

export type DayValues = { revenue: number; ordersCount: number; profit: number }

export type SalesDailyResponse = {
  days: { date: string; wb: DayValues; ozon: DayValues; total: DayValues; previousDate: string; previousTotal: DayValues }[]
}

const dayValues = (acc: Accumulator): DayValues => {
  const { revenue, ordersCount, profit } = finalize(acc)
  return { revenue, ordersCount, profit }
}

/** Накопитель на каждый день периода: дата → [накопитель] для быстрого поиска. */
function perDay(days: readonly string[]): { list: Accumulator[]; byDate: Map<string, Accumulator[]> } {
  const list = days.map(emptyAccumulator)
  return { list, byDate: new Map(days.map((day, i) => [day, [list[i] ?? emptyAccumulator()]])) }
}

/** /api/sales-daily: точка на каждый день периода, WB + Ozon = итог (AC-17). */
export function salesDaily(orders: readonly Order[], filters: Filters): SalesDailyResponse {
  const period = { from: filters.from, to: filters.to }
  const prev = previousPeriod(period)
  const days = eachDay(period)
  const wb = perDay(days)
  const ozon = perDay(days)
  const previous = perDay(eachDay(prev))
  const none: Accumulator[] = []

  const targetsFor = (own: Map<string, Accumulator[]>) => (date: string) => own.get(date) ?? previous.byDate.get(date) ?? none
  const wbTargets = targetsFor(wb.byDate)
  const ozonTargets = targetsFor(ozon.byDate)

  for (const order of orders) {
    if (matchesFilters(order, filters)) accumulateOrder(order, order.marketplace === 'wb' ? wbTargets : ozonTargets)
  }

  return {
    days: days.map((date, i) => {
      const wbAcc = wb.list[i] ?? emptyAccumulator()
      const ozonAcc = ozon.list[i] ?? emptyAccumulator()
      return {
        date,
        wb: dayValues(wbAcc),
        ozon: dayValues(ozonAcc),
        total: dayValues(mergeAccumulators(mergeAccumulators(emptyAccumulator(), wbAcc), ozonAcc)),
        previousDate: addDays(prev.from, i),
        previousTotal: dayValues(previous.list[i] ?? emptyAccumulator()),
      }
    }),
  }
}

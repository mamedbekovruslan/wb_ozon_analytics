import type { Filters, Order } from '../domain'
import { accumulateOrder, emptyAccumulator, finalize, matchesFilters, METRIC_KEYS, type Accumulator, type Metrics } from './metrics'
import { eachDay, periodLength, previousPeriod, type Period } from './period'

const SPARKLINE_POINTS = 14

export type KpiResponse = {
  period: Period
  previousPeriod: Period
  current: Metrics
  previous: Metrics
  sparklines: Record<keyof Metrics, (number | null)[]>
}

/** /api/kpi: метрики текущего и прошлого периода и sparkline по 14 точек (AC-12…AC-18). */
export function kpi(orders: readonly Order[], filters: Filters): KpiResponse {
  const period = { from: filters.from, to: filters.to }
  const prev = previousPeriod(period)
  const n = periodLength(period)
  const points = Math.min(n, SPARKLINE_POINTS)

  const current = emptyAccumulator()
  const previous = emptyAccumulator()
  const buckets: Accumulator[] = Array.from({ length: points }, emptyAccumulator)
  // День i из n попадает в точку floor(i × 14 / n); при n < 14 — точка на день.
  // Списки накопителей готовим заранее: на каждое событие — только поиск в Map
  const currentTargets = new Map(
    eachDay(period).map((day, i) => {
      const bucket = buckets[n < SPARKLINE_POINTS ? i : Math.floor((i * SPARKLINE_POINTS) / n)]
      return [day, bucket ? [current, bucket] : [current]]
    }),
  )
  const previousTargets = [previous]
  const none: Accumulator[] = []

  const targets = (date: string): Accumulator[] => {
    if (date >= period.from && date <= period.to) return currentTargets.get(date) ?? none
    return date >= prev.from && date <= prev.to ? previousTargets : none
  }

  for (const order of orders) {
    if (matchesFilters(order, filters)) accumulateOrder(order, targets)
  }

  const bucketMetrics = buckets.map(finalize)
  const sparklines = Object.fromEntries(METRIC_KEYS.map((key) => [key, bucketMetrics.map((m) => m[key])])) as KpiResponse['sparklines']

  return { period, previousPeriod: prev, current: finalize(current), previous: finalize(previous), sparklines }
}

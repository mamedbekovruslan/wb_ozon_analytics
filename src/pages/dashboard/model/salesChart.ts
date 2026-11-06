import type { SalesDailyResponse } from '../../../entities/sale'
import type { ResolvedFilters } from '../../../shared/api'
import { formatAxisMoney, formatDayMonthLong, formatInt, formatPieces, formatRub, parseDay } from '../../../shared/lib'

// Расчёты графика «Продажи по дням» (spec 005, раздел «Расчёты»). Без React — проверяются unit-тестами.

export type SalesDay = SalesDailyResponse['days'][number]
export type SalesMetric = 'revenue' | 'ordersCount' | 'profit'

type MetricDef = {
  label: string
  /** Значения в подзаголовке, легенде, тултипе и таблице */
  format: (n: number) => string
  /** Подписи оси Y */
  axis: (n: number) => string
  /** Штуки — только целые деления оси (AC-25) */
  integer: boolean
}

export const SALES_METRICS: Record<SalesMetric, MetricDef> = {
  revenue: { label: 'Выручка', format: formatRub, axis: formatAxisMoney, integer: false },
  ordersCount: { label: 'Заказы', format: formatPieces, axis: formatInt, integer: true },
  profit: { label: 'Прибыль', format: formatRub, axis: formatAxisMoney, integer: false },
}

export const SALES_METRIC_ORDER: readonly SalesMetric[] = ['revenue', 'ordersCount', 'profit']

/** Какие серии видны: при одной площадке в фильтре вторая не рисуется (AC-5, AC-6). */
export type SeriesVisibility = { wb: boolean; ozon: boolean; previous: boolean }

export function seriesVisibility(filters: Pick<ResolvedFilters, 'mp' | 'compare'>): SeriesVisibility {
  return { wb: filters.mp !== 'ozon', ozon: filters.mp !== 'wb', previous: filters.compare }
}

// Шаги «круглые» по правилам графиков дизайнера: 1, 2, 2,5, 5, 10 × 10ⁿ
const STEPS = [1, 2, 2.5, 5, 10]
// Для штук ступень 2,5 пропускается, чтобы не было «2,5 заказа» (решение пользователя 2026-11-06)
const INTEGER_STEPS = [1, 2, 5, 10]

function niceStep(raw: number, integer: boolean): number {
  if (integer && raw <= 1) return 1
  const power = 10 ** Math.floor(Math.log10(raw))
  // Допуск — на погрешность деления с плавающей точкой: ровно круглый шаг остаётся собой
  const step = (integer ? INTEGER_STEPS : STEPS).find((m) => m * power >= raw * (1 - 1e-12)) ?? 10
  return step * power
}

// Без хвостов вида 0,30000000000000004 и без −0
const clean = (n: number) => {
  const x = Number(n.toPrecision(12))
  return x === 0 ? 0 : x
}

/**
 * Деления оси Y: без минусов — 0…4·шаг (как в макете), с минусами (прибыль) —
 * от ⌊min / шаг⌋·шаг до ⌈max / шаг⌉·шаг, 0 всегда среди делений.
 */
export function niceAxis(min: number, max: number, options: { integer?: boolean } = {}): { ticks: number[] } {
  const integer = options.integer ?? false
  // Все нули — по смыслу «пусто» (AC-16), сюда попадает только выбранная метрика без значений
  if (min >= 0 && max <= 0) return { ticks: [0] }
  if (min >= 0) {
    const step = niceStep(max / 4, integer)
    return { ticks: [0, 1, 2, 3, 4].map((k) => clean(k * step)) }
  }
  const step = niceStep((max - min) / 4, integer)
  const ticks: number[] = []
  for (let k = Math.floor(min / step); k <= Math.ceil(max / step); k++) ticks.push(clean(k * step))
  return { ticks }
}

/** Индексы дней с подписью на оси X; первая и последняя — всегда. */
export function xTickIndexes(n: number, count: number): number[] {
  if (n <= 0) return []
  if (n <= count) return Array.from({ length: n }, (_, i) => i)
  const step = Math.ceil((n - 1) / (count - 1))
  const indexes: number[] = []
  for (let i = 0; i < n - 1; i += step) indexes.push(i)
  // Предпоследняя подпись, прижатая к последней, налезла бы на неё
  const prev = indexes.at(-1) ?? 0
  if (indexes.length > 1 && n - 1 - prev < step / 2) indexes.pop()
  indexes.push(n - 1)
  return indexes
}

/** «Пусто»: в текущем периоде ни выручки, ни заказов, ни прибыли — не зависит от метрики. */
export function isEmptySales(days: readonly SalesDay[]): boolean {
  return days.every((d) => d.total.revenue === 0 && d.total.ordersCount === 0 && d.total.profit === 0)
}

export type SalesTotals = { wb: number; ozon: number; total: number; previous: number }

export function salesTotals(days: readonly SalesDay[], metric: SalesMetric): SalesTotals {
  const totals = { wb: 0, ozon: 0, total: 0, previous: 0 }
  for (const d of days) {
    totals.wb += d.wb[metric]
    totals.ozon += d.ozon[metric]
    totals.total += d.total[metric]
    totals.previous += d.previousTotal[metric]
  }
  return totals
}

/** Строка данных для Recharts: значения выбранной метрики по дню. */
export type ChartRow = {
  date: string
  previousDate: string
  wb: number
  ozon: number
  total: number
  previous: number
}

export const chartRows = (days: readonly SalesDay[], metric: SalesMetric): ChartRow[] =>
  days.map((d) => ({
    date: d.date,
    previousDate: d.previousDate,
    wb: d.wb[metric],
    ozon: d.ozon[metric],
    total: d.total[metric],
    previous: d.previousTotal[metric],
  }))

/**
 * Границы для оси Y: стопки считаются отдельно по плюсам и минусам (столбцы-минусы растут
 * вниз от нуля); линия прошлого периода учитывается, только когда она видна.
 */
export function axisRange(rows: readonly ChartRow[], visible: SeriesVisibility): { min: number; max: number } {
  let min = 0
  let max = 0
  for (const row of rows) {
    const values = [visible.wb ? row.wb : 0, visible.ozon ? row.ozon : 0]
    const up = values.reduce((s, v) => s + Math.max(v, 0), 0)
    const down = values.reduce((s, v) => s + Math.min(v, 0), 0)
    max = Math.max(max, up, visible.previous ? row.previous : 0)
    min = Math.min(min, down, visible.previous ? row.previous : 0)
  }
  return { min, max }
}

/** aria-label области графика (AC-14): период, серии и итог в формате метрики. */
export function chartAriaLabel(
  period: { from: string; to: string },
  visible: SeriesVisibility,
  total: string,
): string {
  const differentYears = parseDay(period.from).getFullYear() !== parseDay(period.to).getFullYear()
  const from = formatDayMonthLong(period.from, differentYears)
  const to = formatDayMonthLong(period.to, true)
  const series = visible.wb && visible.ozon ? 'WB и Ozon стопкой' : visible.wb ? 'WB' : 'Ozon'
  const previous = visible.previous ? ', пунктир — прошлый период' : ''
  return `Столбцы по дням с ${from} по ${to}: ${series}${previous}. Итого ${total}.`
}

import type { Metrics } from '../../../entities/sale'
import { formatInt, formatPercent, formatRub, formatRubShort } from '../../../shared/lib'

/** Карточки KPI в порядке DESIGN_SPEC § 4 (spec 004, таблица «Карточки»). */
type KpiCardDef = {
  key: keyof Metrics
  label: string
  format: (value: number) => string
  /** Рост — плохо (возвраты): стрелка и знак те же, цвет обратный */
  inverted?: boolean
}

export const KPI_CARDS: readonly KpiCardDef[] = [
  { key: 'revenue', label: 'Выручка', format: formatRubShort },
  { key: 'ordersCount', label: 'Заказы', format: formatInt },
  { key: 'buyoutsCount', label: 'Выкупы', format: formatInt },
  { key: 'buyoutRate', label: '% выкупа', format: formatPercent },
  { key: 'returnsCount', label: 'Возвраты', format: formatInt, inverted: true },
  { key: 'avgCheck', label: 'Средний чек', format: formatRub },
  { key: 'profit', label: 'Прибыль', format: formatRubShort },
  { key: 'margin', label: 'Маржа', format: formatPercent },
]

/** null — показатель не посчитать (нет выкупов, выручка ≤ 0) */
export const formatMetric = (card: KpiCardDef, value: number | null) => (value === null ? '—' : card.format(value))

/** «Нет данных за период»: ни заказов, ни выкупов, ни возвратов (spec 004, AC-16) */
export const isEmptyPeriod = (m: Metrics) => m.ordersCount === 0 && m.buyoutsCount === 0 && m.returnsCount === 0

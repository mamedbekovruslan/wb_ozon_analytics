import type { KpiResponse } from '../../../../entities/sale'
import { evaluateChange } from '../../../../shared/lib'
import { formatMetric, KPI_CARDS } from '../../model/kpiCards'
import { KpiCard } from './KpiCard'

type KpiGridProps = {
  data: KpiResponse
  className: string
  /** Сравнение с прошлым периодом включено (`cmp`) */
  compare: boolean
  /** «было X» — только на десктопе и при включённом сравнении */
  showPrevious: boolean
}

export function KpiGrid({ data, className, compare, showPrevious }: KpiGridProps) {
  return (
    <div className={className}>
      {KPI_CARDS.map((card) => {
        const current = data.current[card.key]
        const previous = data.previous[card.key]
        return (
          <KpiCard
            key={card.key}
            label={card.label}
            value={formatMetric(card, current)}
            previous={showPrevious ? formatMetric(card, previous) : null}
            change={compare ? evaluateChange(current, previous, card.inverted) : null}
            points={data.sparklines[card.key]}
          />
        )
      })}
    </div>
  )
}

import { useMemo, type ComponentType } from 'react'
import {
  chartAriaLabel,
  chartRows,
  SALES_METRICS,
  salesTotals,
  type SalesDay,
  type SalesMetric,
  type SeriesVisibility,
} from '../../model/salesChart'
import { SalesChart } from './SalesChart'
import type { SalesChartPlotProps } from './SalesChartPlot'
import { SalesLegend } from './SalesLegend'
import { SalesTable } from './SalesTable'
import type { SalesChartLayout } from './useSalesChartLayout'

type SalesChartDataProps = {
  plot: ComponentType<SalesChartPlotProps>
  days: readonly SalesDay[]
  metric: SalesMetric
  visible: SeriesVisibility
  period: { from: string; to: string }
  layout: SalesChartLayout
}

/** Состояние «есть данные»: легенда с суммами, график и та же информация таблицей для скринридера. */
export function SalesChartData({ plot, days, metric, visible, period, layout }: SalesChartDataProps) {
  const def = SALES_METRICS[metric]
  const rows = useMemo(() => chartRows(days, metric), [days, metric])
  const totals = useMemo(() => salesTotals(days, metric), [days, metric])

  return (
    <>
      <SalesLegend totals={totals} visible={visible} format={def.format} />
      <SalesChart
        plot={plot}
        rows={rows}
        metric={metric}
        visible={visible}
        layout={layout}
        ariaLabel={chartAriaLabel(period, visible, def.format(totals.total))}
      />
      <SalesTable days={days} metric={metric} visible={visible} />
    </>
  )
}

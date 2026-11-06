import { useId, useState } from 'react'
import { useFilters, useMeta } from '../../../../entities/marketplace'
import { useSalesDaily } from '../../../../entities/sale'
import { cx, useSetFiltersSearch } from '../../../../shared/lib'
import { Segmented, StateBlock, type SegmentedItem } from '../../../../shared/ui'
import {
  isEmptySales,
  SALES_METRIC_ORDER,
  SALES_METRICS,
  salesTotals,
  seriesVisibility,
  type SalesMetric,
} from '../../model/salesChart'
import { SalesChartData } from './SalesChartData'
import styles from './SalesChartPanel.module.css'
import { SalesChartSkeleton } from './SalesChartSkeleton'
import { useChartPlot } from './useChartPlot'
import { useSalesChartLayout } from './useSalesChartLayout'

const METRIC_ITEMS: readonly SegmentedItem<SalesMetric>[] = SALES_METRIC_ORDER.map((value) => ({
  value,
  label: SALES_METRICS[value].label,
}))

const ERROR_TEXT = {
  title: 'График не загрузился',
  // В макете — пример про 502 и Ozon; у нас один API, поэтому общий текст (spec 005)
  text: 'Проверьте соединение и повторите. Остальные блоки работают.',
}

/**
 * «Продажи по дням»: заголовок, переключатель метрики и график за период из фильтров URL.
 * Метрика — состояние блока, не URL (решение пользователя 2026-11-06): ответ API содержит все три.
 */
export function SalesChartPanel() {
  const headingId = useId()
  const [metric, setMetric] = useState<SalesMetric>('revenue')
  const { filters, metaStatus } = useFilters()
  const meta = useMeta()
  const sales = useSalesDaily(filters)
  const setSearch = useSetFiltersSearch()
  const layout = useSalesChartLayout()
  const chart = useChartPlot()

  const days = filters && sales.data && !isEmptySales(sales.data.days) ? sales.data.days : null
  const visible = filters ? seriesVisibility(filters) : null
  const def = SALES_METRICS[metric]
  const totals = days ? salesTotals(days, metric) : null

  let content
  if (metaStatus === 'error') {
    // Без /api/meta неизвестны даты периода — повторяем именно его
    content = <StateBlock kind="error" variant="inset" className={styles.state} {...ERROR_TEXT} onAction={() => void meta.refetch()} />
  } else if (sales.isError && !sales.data) {
    // Если упал лишь фоновый перезапрос, а данные есть, — график остаётся
    content = <StateBlock kind="error" variant="inset" className={styles.state} {...ERROR_TEXT} onAction={() => void sales.refetch()} />
  } else if (!filters || !sales.data) {
    content = <SalesChartSkeleton layout={layout} />
  } else if (!days || !visible) {
    content = (
      <StateBlock
        kind="empty"
        variant="inset"
        className={styles.state}
        title="Нет продаж за период"
        text="Попробуйте расширить период или выбрать все категории."
        actionLabel="Сбросить фильтры"
        onAction={() => setSearch({})}
      />
    )
  } else if (chart.failed) {
    // Не загрузился чанк с Recharts — для пользователя это та же ошибка графика
    content = <StateBlock kind="error" variant="inset" className={styles.state} {...ERROR_TEXT} onAction={chart.retry} />
  } else if (!chart.plot) {
    content = <SalesChartSkeleton layout={layout} />
  } else {
    content = (
      <SalesChartData plot={chart.plot} days={days} metric={metric} visible={visible} period={filters} layout={layout} />
    )
  }

  return (
    <section aria-labelledby={headingId} className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titles}>
          <h2 id={headingId} className={styles.title}>
            Продажи по дням
          </h2>
          {totals && visible && (
            <span className={cx(styles.subtitle, 'num')}>
              {def.format(totals.total)} за период
              {visible.previous && (
                <>
                  {' '}
                  <span className={styles.muted}>· было {def.format(totals.previous)}</span>
                </>
              )}
            </span>
          )}
        </div>
        <Segmented
          label="Метрика графика"
          items={METRIC_ITEMS}
          value={metric}
          onChange={setMetric}
          size="md"
          className={styles.metrics}
        />
      </div>
      {content}
    </section>
  )
}

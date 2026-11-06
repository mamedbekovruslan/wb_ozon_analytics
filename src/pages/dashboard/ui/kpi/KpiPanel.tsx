import { useId } from 'react'
import { useFilters, useMeta } from '../../../../entities/marketplace'
import { useKpi } from '../../../../entities/sale'
import { formatPeriodShort, useMediaQuery, useSetFiltersSearch } from '../../../../shared/lib'
import { StateBlock } from '../../../../shared/ui'
import { isEmptyPeriod } from '../../model/kpiCards'
import { KpiGrid } from './KpiGrid'
import styles from './KpiPanel.module.css'
import { KpiSkeleton } from './KpiSkeleton'

// «было X» — только на десктопе (DESIGN_SPEC § 4): на узких карточках не помещается
const DESKTOP_QUERY = '(min-width: 1200px)'

const ERROR_TEXT = { title: 'Не удалось загрузить показатели', text: 'Проверьте соединение и повторите.' }

/** Восемь KPI за период из фильтров URL; состояния загрузки, «нет данных» и ошибки — свои (DESIGN_SPEC § 5). */
export function KpiPanel() {
  const headingId = useId()
  const { filters, metaStatus } = useFilters()
  const meta = useMeta()
  const kpi = useKpi(filters)
  const setSearch = useSetFiltersSearch()
  const desktop = useMediaQuery(DESKTOP_QUERY)

  let content
  if (metaStatus === 'error') {
    // Без /api/meta неизвестны даты периода — повторяем именно его
    content = <StateBlock kind="error" {...ERROR_TEXT} onAction={() => void meta.refetch()} />
  } else if (kpi.isError && !kpi.data) {
    // Если упал лишь фоновый перезапрос, а данные есть, — оставляем карточки
    content = <StateBlock kind="error" {...ERROR_TEXT} onAction={() => void kpi.refetch()} />
  } else if (!filters || !kpi.data) {
    content = <KpiSkeleton className={styles.grid} />
  } else if (isEmptyPeriod(kpi.data.current)) {
    content = (
      <StateBlock
        kind="empty"
        title="Нет данных за период"
        text={`За ${formatPeriodShort(filters.from, filters.to)} по выбранным фильтрам не было ни заказов, ни выкупов.`}
        actionLabel="Сбросить фильтры"
        onAction={() => setSearch({})}
      />
    )
  } else {
    content = (
      <KpiGrid
        data={kpi.data}
        className={styles.grid}
        compare={filters.compare}
        showPrevious={filters.compare && desktop}
      />
    )
  }

  return (
    <section aria-labelledby={headingId}>
      <h2 id={headingId} className="sr-only">
        Ключевые показатели
      </h2>
      {content}
    </section>
  )
}

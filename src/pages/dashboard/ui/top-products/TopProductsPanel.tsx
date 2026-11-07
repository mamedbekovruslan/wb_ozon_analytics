import { useId, useMemo, useState } from 'react'
import { useFilters, useMeta } from '../../../../entities/marketplace'
import { useTopProducts } from '../../../../entities/product'
import type { CategoryId } from '../../../../shared/api'
import { MOBILE_QUERY, useMediaQuery, useSetFiltersSearch } from '../../../../shared/lib'
import { Button, SortIcon, StateBlock } from '../../../../shared/ui'
import {
  DEFAULT_TOP_SORT,
  nextMobileSort,
  sortTopItems,
  toggleTopSort,
  TOP_SORTS,
  topSubtitle,
  type TopSortState,
} from '../../model/topProducts'
import { TopProductsCards } from './TopProductsCards'
import styles from './TopProductsPanel.module.css'
import { TopProductsSkeleton } from './TopProductsSkeleton'
import { TopProductsTable } from './TopProductsTable'

const ERROR_TEXT = {
  title: 'Не удалось загрузить товары',
  // В макете — «Сервер вернул ошибку 500. Мы уже повторяем запрос.»; сами мы не повторяем,
  // а причина бывает разной, поэтому общий текст, как у графика (spec 006)
  text: 'Проверьте соединение и повторите. Остальные блоки работают.',
}

/**
 * «Топ-10 товаров» за период из фильтров URL. Сортировка — состояние блока, не URL (spec 006):
 * метрика уходит в запрос (сервер отдаёт топ по ней), направление лишь разворачивает строки.
 */
export function TopProductsPanel() {
  const headingId = useId()
  const [sortState, setSortState] = useState<TopSortState>(DEFAULT_TOP_SORT)
  const { filters, meta, metaStatus } = useFilters()
  const metaQuery = useMeta()
  const top = useTopProducts(filters && { ...filters, sort: sortState.sort })
  const setSearch = useSetFiltersSearch()
  const mobile = useMediaQuery(MOBILE_QUERY)

  const categoryNames = useMemo(() => new Map(meta?.categories.map((c) => [c.id, c.name])), [meta])
  const categoryName = (id: CategoryId) => categoryNames.get(id) ?? id

  let content
  if (metaStatus === 'error') {
    // Без /api/meta неизвестны даты периода — повторяем именно его
    content = <StateBlock kind="error" variant="flush" {...ERROR_TEXT} onAction={() => void metaQuery.refetch()} />
  } else if (top.isError && !top.data) {
    // Если упал лишь фоновый перезапрос, а данные есть, — таблица остаётся
    content = <StateBlock kind="error" variant="flush" {...ERROR_TEXT} onAction={() => void top.refetch()} />
  } else if (!filters || !top.data) {
    content = <TopProductsSkeleton mobile={mobile} />
  } else if (top.data.items.length === 0) {
    content = (
      <StateBlock
        kind="empty"
        variant="flush"
        title="Нет продаж за период"
        text="Топ появится, когда будет хотя бы один выкуп."
        actionLabel="Сбросить фильтры"
        onAction={() => setSearch({})}
      />
    )
  } else {
    const items = sortTopItems(top.data.items, sortState.sort, sortState.dir)
    // Строки прежней метрики, пока грузится новая (AC-9)
    const busy = top.isPlaceholderData
    content = mobile ? (
      // В карточке категории нет — как в макете
      <TopProductsCards items={items} busy={busy} />
    ) : (
      <TopProductsTable
        items={items}
        busy={busy}
        sort={sortState}
        onSort={(sort) => setSortState((current) => toggleTopSort(current, sort))}
        categoryName={categoryName}
        labelledBy={headingId}
      />
    )
  }

  const buttonLabel = TOP_SORTS[sortState.sort].button

  return (
    <section aria-labelledby={headingId} className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titles}>
          <h2 id={headingId} className={styles.title}>
            Топ-10 товаров
          </h2>
          <span className={styles.subtitle}>{topSubtitle(sortState)}</span>
        </div>
        {mobile && (
          <Button
            variant="secondary"
            className={styles.cycle}
            aria-label={`Сменить сортировку, сейчас: ${buttonLabel}`}
            onClick={() => setSortState((current) => nextMobileSort(current.sort))}
          >
            <SortIcon />
            {buttonLabel}
          </Button>
        )}
      </div>
      {content}
    </section>
  )
}

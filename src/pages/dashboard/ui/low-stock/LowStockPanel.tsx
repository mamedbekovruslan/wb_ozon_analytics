import { Link } from '@tanstack/react-router'
import { useId } from 'react'
import { useLowStock } from '../../../../entities/warehouse'
import { useFiltersSearch, useSetFiltersSearch } from '../../../../shared/lib'
import { ArrowRightIcon, StateBlock } from '../../../../shared/ui'
import { lowStockSubtitle, pickLowStockItems } from '../../model/lowStock'
import { LowStockList } from './LowStockList'
import styles from './LowStockPanel.module.css'
import { LowStockSkeleton } from './LowStockSkeleton'

/**
 * «Скоро закончится»: пять позиций «товар × склад» с наименьшим запасом (spec 007). Остатки —
 * на сегодня, поэтому из фильтров нужны только площадка и категории; /api/meta не ждём.
 */
export function LowStockPanel() {
  const headingId = useId()
  const search = useFiltersSearch()
  const stocks = useLowStock({ mp: search.mp ?? 'all', cat: search.cat ?? [] })
  const setSearch = useSetFiltersSearch()

  let content
  let subtitle = lowStockSubtitle()
  if (stocks.isError && !stocks.data) {
    // Если упал лишь фоновый перезапрос, а данные есть, — список остаётся
    content = (
      <StateBlock
        kind="error"
        variant="fill"
        title="Не удалось получить остатки"
        text="Проверьте соединение и повторите."
        onAction={() => void stocks.refetch()}
      />
    )
  } else if (!stocks.data) {
    content = <LowStockSkeleton />
  } else {
    const items = pickLowStockItems(stocks.data.items)
    if (items.length === 0) {
      content = (
        <StateBlock
          kind="empty"
          tone="success"
          variant="fill"
          title="Ничего не заканчивается"
          text="У всех товаров запас больше 14 дней по выбранным фильтрам."
          actionLabel="Сбросить фильтры"
          onAction={() => setSearch({})}
        />
      )
    } else {
      subtitle = lowStockSubtitle(items.length)
      content = <LowStockList items={items} />
    }
  }

  return (
    <section aria-labelledby={headingId} className={styles.card}>
      <div className={styles.header}>
        <div className={styles.titles}>
          <h2 id={headingId} className={styles.title}>
            Скоро закончится
          </h2>
          <span className={styles.subtitle}>{subtitle}</span>
        </div>
        {/* Фильтры общие для всех страниц: на «Остатки» уходят все, включая период (spec 007, AC-11) */}
        <Link to="/stocks" search={search} className={styles.link}>
          Все остатки
          <ArrowRightIcon />
        </Link>
      </div>
      {content}
    </section>
  )
}

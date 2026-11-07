import { MarketplaceBadge } from '../../../../entities/marketplace'
import type { TopProduct, TopSort } from '../../../../entities/product'
import type { CategoryId } from '../../../../shared/api'
import { cx, formatInt, formatRub } from '../../../../shared/lib'
import { ArrowDownIcon, ArrowUpIcon, SortIcon } from '../../../../shared/ui'
import { TABLE_SORT_ORDER, TOP_SORTS, type TopSortState } from '../../model/topProducts'
import { BuyoutValue } from './BuyoutValue'
import { ProductThumb } from './ProductThumb'
import styles from './TopProductsTable.module.css'

type TopProductsTableProps = {
  items: readonly TopProduct[]
  /** Показаны строки прежней метрики, новая ещё грузится */
  busy: boolean
  sort: TopSortState
  onSort: (sort: TopSort) => void
  categoryName: (id: CategoryId) => string
  /** id заголовка секции — имя таблицы для скринридера */
  labelledBy: string
}

/** Таблица топа на ≥ 640 (Dashboard.dc.html, `L.table`); заголовки метрик — кнопки сортировки. */
export function TopProductsTable({ items, busy, sort, onSort, categoryName, labelledBy }: TopProductsTableProps) {
  return (
    <div className={styles.scroll}>
      <table className={styles.table} aria-labelledby={labelledBy} aria-busy={busy || undefined}>
        <thead>
          <tr className={styles.headRow}>
            <th scope="col" className={cx(styles.th, styles.rankHead)}>
              #
            </th>
            <th scope="col" className={styles.th}>
              Товар
            </th>
            <th scope="col" className={cx(styles.th, styles.mpHead)}>
              Площадка
            </th>
            {TABLE_SORT_ORDER.map((key) => {
              const active = sort.sort === key
              return (
                <th
                  key={key}
                  scope="col"
                  aria-sort={active ? (sort.dir === 'desc' ? 'descending' : 'ascending') : 'none'}
                  className={cx(styles.th, styles.sortHead, styles[key])}
                >
                  <button type="button" className={cx(styles.sortButton, active && styles.active)} onClick={() => onSort(key)}>
                    {TOP_SORTS[key].column}
                    {!active ? (
                      <SortIcon size={12} strokeWidth={1.6} className={styles.idleArrow} />
                    ) : sort.dir === 'desc' ? (
                      <ArrowDownIcon size={12} />
                    ) : (
                      <ArrowUpIcon size={12} />
                    )}
                  </button>
                </th>
              )
            })}
          </tr>
        </thead>
        <tbody>
          {items.map((item, index) => (
            <tr key={item.sku} className={styles.row}>
              <td className={cx(styles.rank, 'num')}>{index + 1}</td>
              <td className={styles.product}>
                <div className={styles.productInner}>
                  <ProductThumb size={36} />
                  <div className={styles.productText}>
                    <span className={styles.name}>{item.name}</span>
                    <span className={cx(styles.sub, 'num')}>{`Арт. ${item.sku} · ${categoryName(item.category)}`}</span>
                  </div>
                </div>
              </td>
              <td className={styles.mp}>
                <MarketplaceBadge marketplace={item.marketplace} />
              </td>
              <td className={cx(styles.value, styles.strong, 'num')}>{formatRub(item.revenue)}</td>
              <td className={cx(styles.value, 'num')}>{formatInt(item.ordersCount)}</td>
              <td className={cx(styles.value, 'num')}>
                <BuyoutValue value={item.buyoutRate} />
              </td>
              <td className={cx(styles.value, styles.last, styles.strong, 'num')}>{formatRub(item.profit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

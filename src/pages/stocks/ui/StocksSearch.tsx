import { cx, formatInt } from '../../../shared/lib'
import { SearchIcon, Skeleton } from '../../../shared/ui'
import { SEARCH_MAX_LENGTH } from '../model/stocksView'
import styles from './StocksSearch.module.css'

type StocksSearchProps = {
  query: string
  onQueryChange: (query: string) => void
  /** Строк после поиска и плитки; null — данных нет: загрузка (скелетон) или ошибка (скрыт) */
  found: number | null
  failed?: boolean
}

/** Поиск по названию, артикулу или складу и счётчик найденного (Stock.dc.html, AC-8, AC-9). */
export function StocksSearch({ query, onQueryChange, found, failed = false }: StocksSearchProps) {
  return (
    <div className={styles.row}>
      <label className={styles.field}>
        <SearchIcon className={styles.icon} />
        <span className="sr-only">Поиск по названию, артикулу или складу</span>
        <input
          type="search"
          value={query}
          maxLength={SEARCH_MAX_LENGTH}
          placeholder="Товар, артикул или склад"
          className={styles.input}
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>
      {!failed && (
        <span aria-live="polite" className={cx(styles.found, 'num')}>
          Позиций «товар × склад»:{' '}
          {found === null ? <Skeleton className={styles.foundSkeleton} /> : <span className={styles.foundValue}>{formatInt(found)}</span>}
        </span>
      )}
    </div>
  )
}

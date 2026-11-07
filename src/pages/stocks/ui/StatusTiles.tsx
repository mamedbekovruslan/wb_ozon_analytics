import { STOCK_STATUS_LABEL, StockStatusIcon, type StockStatus } from '../../../entities/warehouse'
import { cx, formatInt } from '../../../shared/lib'
import { Skeleton } from '../../../shared/ui'
import { STATUS_HINT, STOCK_STATUSES } from '../model/stocksView'
import styles from './StatusTiles.module.css'

type StatusTilesProps = {
  /** loading — число ещё неизвестно (скелетон); error — «—» (AC-20, AC-22) */
  state: 'ready' | 'loading' | 'error'
  counts: Record<StockStatus, number>
  selected: StockStatus | null
  onSelect: (status: StockStatus | null) => void
}

/** Плитки-фильтры по статусу запаса (Stock.dc.html): повторное нажатие снимает выбор (AC-5, AC-6). */
export function StatusTiles({ state, counts, selected, onSelect }: StatusTilesProps) {
  return (
    <div role="group" aria-label="Фильтр по статусу запаса" className={styles.tiles}>
      {STOCK_STATUSES.map((status) => {
        const on = selected === status
        return (
          <button
            key={status}
            type="button"
            aria-pressed={on}
            className={cx(styles.tile, styles[status], on && styles.selected)}
            onClick={() => onSelect(on ? null : status)}
          >
            <span aria-hidden="true" className={styles.icon}>
              <StockStatusIcon status={status} size={18} />
            </span>
            <span className={styles.body}>
              <span className={cx(styles.count, 'num')}>
                {state === 'ready' ? formatInt(counts[status]) : state === 'error' ? '—' : <Skeleton className={styles.countSkeleton} />}
              </span>
              <span className={styles.label}>{STOCK_STATUS_LABEL[status]}</span>
            </span>
            <span className={styles.hint}>{STATUS_HINT[status]}</span>
          </button>
        )
      })}
    </div>
  )
}

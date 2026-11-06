import { useFilters } from '../../../entities/marketplace'
import { cx, formatDate, formatRange, parseDay } from '../../../shared/lib'
import { Skeleton } from '../../../shared/ui'
import styles from './DashboardHeader.module.css'

/**
 * «сегодня в 07:40» / «03.11.2026 в 07:40». Дата и время берутся из строки ответа
 * (`2026-11-04T07:40:00+03:00` — уже по Москве), а не через Date в поясе браузера.
 */
function formatUpdated(updatedAt: string, today: string): string {
  const day = updatedAt.slice(0, 10)
  const time = updatedAt.slice(11, 16)
  return `${day === today ? 'сегодня' : formatDate(parseDay(day))} в ${time}`
}

/** Заголовок дашборда (Dashboard.dc.html): период со сравнением и время обновления данных. */
export function DashboardHeader() {
  const { filters, meta, metaStatus } = useFilters()

  return (
    <div className={styles.header}>
      <div className={styles.titles}>
        <h1 className={styles.title}>Дашборд</h1>
        {filters && (
          <span className={cx(styles.period, 'num')}>
            {formatRange(filters.from, filters.to)}
            {filters.compare && (
              <span className={styles.previous}> · сравнение с {formatRange(filters.prevFrom, filters.prevTo)}</span>
            )}
          </span>
        )}
        {metaStatus === 'pending' && <Skeleton className={styles.periodSkeleton} />}
      </div>
      {meta && (
        <span className={styles.updated}>
          <span aria-hidden="true" className={styles.dot} />
          Данные WB и Ozon обновлены {formatUpdated(meta.updatedAt, meta.today)}
        </span>
      )}
    </div>
  )
}

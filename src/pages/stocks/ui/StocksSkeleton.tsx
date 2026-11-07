import { Skeleton } from '../../../shared/ui'
import styles from './StocksSkeleton.module.css'

/** Ширины первой полосы по строкам, % — разная длина названий (Stock.dc.html, skRows) */
const NAME_WIDTHS = [62, 48, 70, 55, 66, 44, 58, 72, 50, 64]

/** Загрузка остатков (AC-20): форма таблицы на ≥ 640, форма карточек — ниже. */
export function StocksSkeleton({ mobile }: { mobile: boolean }) {
  return (
    <div aria-busy="true" aria-label="Загружаем остатки" className={styles.card}>
      {!mobile && <div className={styles.head} />}
      {NAME_WIDTHS.map((width, i) => (
        <div key={i} className={styles.row}>
          <Skeleton className={styles.thumb} />
          <div className={styles.lines}>
            <span className={styles.lineSlot} style={{ width: `${width}%` }}>
              <Skeleton className={styles.line} />
            </span>
            <Skeleton className={styles.subline} />
          </div>
          <Skeleton className={styles.value} />
          {!mobile && (
            <>
              <Skeleton className={styles.bar} />
              <Skeleton className={styles.badge} />
            </>
          )}
        </div>
      ))}
    </div>
  )
}

import { Skeleton } from '../../../../shared/ui'
import styles from './KpiSkeleton.module.css'

const CARDS = 8

/** Загрузка KPI: статичные скелетоны той же геометрии, что карточки (Dashboard.dc.html, state=loading). */
export function KpiSkeleton({ className }: { className?: string }) {
  return (
    <div aria-busy="true" aria-label="Загружаем показатели" className={className}>
      {Array.from({ length: CARDS }, (_, i) => (
        <div key={i} className={styles.card}>
          <Skeleton className={styles.label} />
          <Skeleton className={styles.value} />
          <div className={styles.footer}>
            <Skeleton className={styles.badge} />
            <Skeleton className={styles.sparkline} />
          </div>
        </div>
      ))}
    </div>
  )
}

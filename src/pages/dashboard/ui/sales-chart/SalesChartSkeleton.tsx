import type { CSSProperties } from 'react'
import { Skeleton } from '../../../../shared/ui'
import styles from './SalesChartSkeleton.module.css'
import type { SalesChartLayout } from './useSalesChartLayout'

// Высоты столбцов из макета (Dashboard.dc.html, skBars), %: статичные, без шиммера
const BARS = [
  42, 55, 48, 62, 58, 70, 52, 45, 60, 66, 72, 58, 50, 63, 68, 75, 61, 54, 66, 70, 78, 64, 57, 69, 74, 80, 67, 60, 72, 76,
]

/** Загрузка графика: полосы легенды и столбцы разной высоты той же геометрии, что график. */
export function SalesChartSkeleton({ layout }: { layout: SalesChartLayout }) {
  const plot: CSSProperties = { height: layout.plotHeight, paddingLeft: layout.yAxisWidth }
  return (
    <div aria-busy="true" aria-label="Загружаем график" className={styles.skeleton}>
      <div className={styles.legend}>
        <Skeleton className={styles.legendItem} />
        <Skeleton className={styles.legendItem} />
        <Skeleton className={styles.legendItem} />
      </div>
      <div className={styles.plot} style={plot}>
        {BARS.map((h, i) => (
          <span key={i} aria-hidden="true" className={styles.bar} style={{ height: `${h}%` }} />
        ))}
      </div>
    </div>
  )
}

import { cx } from '../../../../shared/lib'
import type { SalesTotals, SeriesVisibility } from '../../model/salesChart'
import styles from './SalesLegend.module.css'

type SalesLegendProps = {
  totals: SalesTotals
  visible: SeriesVisibility
  format: (n: number) => string
}

/** Легенда над графиком с суммами серий — ответ без наведения (Guidelines, «Правила графиков»). */
export function SalesLegend({ totals, visible, format }: SalesLegendProps) {
  return (
    <div className={styles.legend}>
      {visible.wb && (
        <span className={styles.item}>
          <span aria-hidden="true" className={cx(styles.swatch, styles.wb)} />
          WB <span className={cx(styles.value, 'num')}>{format(totals.wb)}</span>
        </span>
      )}
      {visible.ozon && (
        <span className={styles.item}>
          <span aria-hidden="true" className={cx(styles.swatch, styles.ozon)} />
          Ozon <span className={cx(styles.value, 'num')}>{format(totals.ozon)}</span>
        </span>
      )}
      {visible.previous && (
        <span className={styles.item}>
          <svg aria-hidden="true" width="18" height="10" className={styles.previous}>
            <line x1="0" y1="5" x2="18" y2="5" />
          </svg>
          Прошлый период
        </span>
      )}
    </div>
  )
}

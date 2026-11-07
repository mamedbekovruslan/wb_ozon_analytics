import { cx } from '../../../../shared/lib'
import { LOW_STOCK_ROWS } from '../../model/lowStock'
import styles from './LowStockSkeleton.module.css'

const ROWS = Array.from({ length: LOW_STOCK_ROWS }, (_, i) => i)

/** Скелетон той же геометрии, что строки (Dashboard.dc.html, low-h, loading); статичный, без шиммера. */
export function LowStockSkeleton() {
  return (
    <div aria-busy="true" aria-label="Загружаем остатки" className={styles.skeleton}>
      {ROWS.map((i) => (
        <div key={i} className={styles.row}>
          <div className={styles.thumb} />
          <div className={styles.main}>
            <div className={cx(styles.bar, styles.name)} />
            <div className={cx(styles.bar, styles.meta)} />
          </div>
          <div className={styles.side}>
            <div className={cx(styles.bar, styles.days)} />
            <div className={cx(styles.bar, styles.status)} />
          </div>
        </div>
      ))}
    </div>
  )
}

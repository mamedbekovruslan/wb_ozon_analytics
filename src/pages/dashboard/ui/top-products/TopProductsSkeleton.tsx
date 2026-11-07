import { cx } from '../../../../shared/lib'
import { Skeleton } from '../../../../shared/ui'
import styles from './TopProductsSkeleton.module.css'

const ROWS = Array.from({ length: 10 }, (_, i) => i)

/** Скелетон топа (Dashboard.dc.html, B.top.load): шапка таблицы и 10 строк с превью, без шиммера. */
export function TopProductsSkeleton({ mobile }: { mobile: boolean }) {
  return (
    <div aria-busy="true" aria-label="Загружаем топ товаров" className={styles.skeleton}>
      <div className={styles.strip} />
      {ROWS.map((row) => (
        <div key={row} className={styles.row}>
          <Skeleton className={styles.thumb} />
          <div className={styles.lines}>
            <Skeleton className={cx(styles.line, styles.name)} />
            <Skeleton className={cx(styles.line, styles.sub)} />
          </div>
          {!mobile && (
            <div className={styles.values}>
              <Skeleton className={cx(styles.value, styles.w72)} />
              <Skeleton className={cx(styles.value, styles.w40)} />
              <Skeleton className={cx(styles.value, styles.w48)} />
              <Skeleton className={cx(styles.value, styles.w72)} />
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

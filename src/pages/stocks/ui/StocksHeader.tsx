import { useMeta } from '../../../entities/marketplace'
import { cx, formatDate, parseDay } from '../../../shared/lib'
import { Skeleton } from '../../../shared/ui'
import styles from './StocksHeader.module.css'

/**
 * «На 04.11.2026, 07:40». Дата и время — из строки ответа (`2026-11-04T07:40:00+03:00`, уже
 * по Москве), а не через Date в поясе браузера.
 */
function formatAsOf(updatedAt: string): string {
  return `На ${formatDate(parseDay(updatedAt.slice(0, 10)))}, ${updatedAt.slice(11, 16)}`
}

const SPEED_NOTE = 'скорость — средние выкупы в день за 14 дней'

/** Заголовок «Остатков» (Stock.dc.html): момент данных и как считается скорость (AC-4). */
export function StocksHeader() {
  const meta = useMeta()

  let subtitle
  if (meta.data) {
    subtitle = (
      <span className={cx(styles.subtitle, 'num')}>
        {formatAsOf(meta.data.updatedAt)} <span className={styles.note}>· {SPEED_NOTE}</span>
      </span>
    )
  } else if (meta.isError) {
    // Без /api/meta момента данных нет — остаётся только пояснение
    subtitle = <span className={cx(styles.subtitle, styles.note)}>{SPEED_NOTE}</span>
  } else {
    // Та же высота строки, что у текста: страница не сдвигается, когда он появится
    subtitle = (
      <span className={styles.subtitle}>
        <Skeleton className={styles.subtitleSkeleton} />
      </span>
    )
  }

  return (
    <div className={styles.header}>
      <h1 className={styles.title}>Остатки</h1>
      {subtitle}
    </div>
  )
}

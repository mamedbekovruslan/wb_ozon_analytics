import { Button, CalendarIcon, Skeleton } from '../../../shared/ui'
import { formatRange } from '../model/period'
import styles from './RangeButton.module.css'

type RangeButtonProps = {
  /** null — даты ещё неизвестны (загрузка /api/meta) или недоступны */
  range: { from: string; to: string } | null
  loading: boolean
}

/**
 * Кнопка своего периода. Календарь — фича 2b, до неё кнопка видна, но не активна (AC-23):
 * aria-disabled вместо disabled, чтобы она выглядела как в макете и оставалась в порядке фокуса.
 */
export function RangeButton({ range, loading }: RangeButtonProps) {
  const text = range ? formatRange(range.from, range.to) : null
  return (
    <Button
      variant="secondary"
      className={styles.button}
      aria-disabled="true"
      aria-label={text ? `Произвольный период: ${text}` : 'Произвольный период'}
    >
      <CalendarIcon className={styles.icon} />
      {text && <span className="num">{text}</span>}
      {!text && loading && <Skeleton className={styles.skeleton} />}
    </Button>
  )
}

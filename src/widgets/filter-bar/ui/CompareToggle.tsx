import { cx } from '../../../shared/lib'
import { Skeleton, Switch } from '../../../shared/ui'
import { formatRange } from '../model/period'
import styles from './CompareToggle.module.css'

type CompareToggleProps = {
  checked: boolean
  onChange: (checked: boolean) => void
  /** Прошлый период; null — пока неизвестен */
  prevRange: { from: string; to: string } | null
  loading: boolean
  /** bar — панель, sheet — bottom sheet */
  layout: 'bar' | 'sheet'
}

/** «Сравнить с прошлым» + подпись прошлого периода (та же длина, непосредственно перед текущим). */
export function CompareToggle({ checked, onChange, prevRange, loading, layout }: CompareToggleProps) {
  const toggle = (
    <Switch label="Сравнить с прошлым периодом" checked={checked} onChange={onChange} size={layout === 'bar' ? 'md' : 'lg'} />
  )
  const caption = (
    <span className={styles.texts}>
      <span className={styles.title}>{layout === 'bar' ? 'Сравнить с прошлым' : 'Сравнить с прошлым периодом'}</span>
      {prevRange && <span className={cx(styles.prev, 'num')}>{formatRange(prevRange.from, prevRange.to)}</span>}
      {!prevRange && loading && <Skeleton className={styles.skeleton} />}
    </span>
  )

  return (
    <div className={cx(styles.root, styles[layout])}>
      {layout === 'bar' ? toggle : caption}
      {layout === 'bar' ? caption : toggle}
    </div>
  )
}

import { cx } from '../../lib/cx'
import styles from './Segmented.module.css'

export type SegmentedItem<T extends string> = {
  value: T
  label: string
  /** Класс цветной метки 8 × 8 (например, цвет площадки) */
  dotClassName?: string
}

type SegmentedProps<T extends string> = {
  /** Имя группы для скринридера */
  label: string
  items: readonly SegmentedItem<T>[]
  /** null — ни один сегмент не выбран */
  value: T | null
  onChange: (value: T) => void
  /** sm — сегменты периода, md — площадки, lg — сетка на всю ширину в bottom sheet */
  size: 'sm' | 'md' | 'lg'
}

/** Сегментированный переключатель: группа кнопок с aria-pressed (Chrome.dc.html). */
export function Segmented<T extends string>({ label, items, value, onChange, size }: SegmentedProps<T>) {
  return (
    <div role="group" aria-label={label} className={cx(styles.group, styles[size])}>
      {items.map((item) => (
        <button
          key={item.value}
          type="button"
          aria-pressed={item.value === value}
          className={styles.item}
          onClick={() => onChange(item.value)}
        >
          {item.dotClassName && <span aria-hidden="true" className={cx(styles.dot, item.dotClassName)} />}
          {item.label}
        </button>
      ))}
    </div>
  )
}

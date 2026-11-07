import { cx } from '../../../../shared/lib'
import { ImageIcon } from '../../../../shared/ui'
import styles from './ProductThumb.module.css'

const SIZE_CLASS = { 36: undefined, 40: styles.medium, 44: styles.large } as const

/**
 * Заглушка фото товара: фото в данных нет (spec 006). 36 — таблица топа, 40 — «Скоро закончится»
 * (spec 007), 44 — карточка топа.
 */
export function ProductThumb({ size }: { size: 36 | 40 | 44 }) {
  return (
    <span aria-hidden="true" className={cx(styles.thumb, SIZE_CLASS[size])}>
      <ImageIcon size={size === 36 ? 16 : 18} />
    </span>
  )
}

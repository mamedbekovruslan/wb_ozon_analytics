import { cx } from '../../../../shared/lib'
import { ImageIcon } from '../../../../shared/ui'
import styles from './ProductThumb.module.css'

/** Заглушка фото товара: фото в данных нет (spec 006). 36 — таблица, 44 — карточка. */
export function ProductThumb({ size }: { size: 36 | 44 }) {
  return (
    <span aria-hidden="true" className={cx(styles.thumb, size === 44 && styles.large)}>
      <ImageIcon size={size === 44 ? 18 : 16} />
    </span>
  )
}

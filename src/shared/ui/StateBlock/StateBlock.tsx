import type { ReactNode } from 'react'
import { cx } from '../../lib'
import { Button } from '../Button/Button'
import { InboxIcon, RefreshIcon, WarningIcon } from '../icons'
import styles from './StateBlock.module.css'

type StateBlockProps = {
  title: string
  text: ReactNode
  onAction: () => void
  className?: string
} & (
  // empty — «нет данных» с действием (обычно «Сбросить фильтры»);
  // error — «не удалось загрузить», кнопка всегда «Повторить» с иконкой обновления (DESIGN_SPEC § 5)
  { kind: 'empty'; actionLabel: string } | { kind: 'error' }
)

/** Состояние блока с данными: иконка в круге, заголовок, пояснение и кнопка. */
export function StateBlock(props: StateBlockProps) {
  const { title, text, onAction, className } = props
  const error = props.kind === 'error'
  return (
    <div role={error ? 'alert' : undefined} className={cx(styles.block, className)}>
      <span aria-hidden="true" className={cx(styles.icon, error ? styles.iconError : styles.iconEmpty)}>
        {error ? <WarningIcon /> : <InboxIcon />}
      </span>
      <span className={styles.title}>{title}</span>
      <span className={styles.text}>{text}</span>
      <Button variant="secondary" className={styles.action} onClick={onAction}>
        {error && <RefreshIcon />}
        {props.kind === 'error' ? 'Повторить' : props.actionLabel}
      </Button>
    </div>
  )
}

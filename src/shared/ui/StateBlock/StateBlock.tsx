import type { ReactNode } from 'react'
import { cx } from '../../lib'
import { Button } from '../Button/Button'
import { CheckIcon, InboxIcon, RefreshIcon, WarningIcon } from '../icons'
import styles from './StateBlock.module.css'

type StateBlockProps = {
  title: string
  text: ReactNode
  onAction: () => void
  className?: string
  /**
   * card — отдельная карточка (KPI); inset — внутри карточки блока: пунктирная рамка,
   * высоту задаёт место использования (график, Dashboard.dc.html);
   * flush — под шапкой карточки без своей рамки: линия сверху, min-height 280 (топ товаров);
   * fill — внутри карточки с padding: линия сверху, min-height 240, растягивается по высоте
   * карточки («Скоро закончится», Dashboard.dc.html)
   */
  variant?: 'card' | 'inset' | 'flush' | 'fill'
} & (
  // empty — «нет данных» с действием (обычно «Сбросить фильтры»); tone="success" — пусто, и это
  // хорошо: галочка на --success-soft («Ничего не заканчивается»);
  // error — «не удалось загрузить», кнопка всегда «Повторить» с иконкой обновления (DESIGN_SPEC § 5)
  { kind: 'empty'; actionLabel: string; tone?: 'neutral' | 'success' } | { kind: 'error' }
)

/** Состояние блока с данными: иконка в круге, заголовок, пояснение и кнопка. */
export function StateBlock(props: StateBlockProps) {
  const { title, text, onAction, className, variant = 'card' } = props
  const error = props.kind === 'error'
  const success = props.kind === 'empty' && props.tone === 'success'
  return (
    <div role={error ? 'alert' : undefined} className={cx(styles.block, styles[variant], className)}>
      <span
        aria-hidden="true"
        className={cx(styles.icon, error ? styles.iconError : success ? styles.iconSuccess : styles.iconEmpty)}
      >
        {error ? <WarningIcon /> : success ? <CheckIcon size={20} strokeWidth={1.6} /> : <InboxIcon />}
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

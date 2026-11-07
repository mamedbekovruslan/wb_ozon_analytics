import type { ReactNode } from 'react'
import { cx } from '../../lib'
import { Button } from '../Button/Button'
import { BoxIcon, CheckIcon, InboxIcon, RefreshIcon, SearchIcon, WarningIcon } from '../icons'
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
   * карточки («Скоро закончится», Dashboard.dc.html);
   * page — карточка вместо таблицы страницы: круг 48, заголовок 16/24, min-height по ширине
   * (Stock.dc.html, spec 008)
   */
  variant?: 'card' | 'inset' | 'flush' | 'fill' | 'page'
} & (
  // empty — «нет данных» с действием (обычно «Сбросить фильтры»); tone="success" — пусто, и это
  // хорошо: галочка на --success-soft («Ничего не заканчивается»);
  // error — «не удалось загрузить», кнопка всегда «Повторить» с иконкой обновления (DESIGN_SPEC § 5)
  // icon — у «пусто» на странице «Остатки»: коробка (нет остатков) или лупа (поиск ничего не нашёл)
  { kind: 'empty'; actionLabel: string; tone?: 'neutral' | 'success'; icon?: 'inbox' | 'box' | 'search' } | { kind: 'error' }
)

/** Состояние блока с данными: иконка в круге, заголовок, пояснение и кнопка. */
export function StateBlock(props: StateBlockProps) {
  const { title, text, onAction, className, variant = 'card' } = props
  const error = props.kind === 'error'
  const success = props.kind === 'empty' && props.tone === 'success'
  const page = variant === 'page'
  const iconSize = page ? 22 : 20
  let icon
  if (error) icon = <WarningIcon size={iconSize} />
  else if (success) icon = <CheckIcon size={20} strokeWidth={1.6} />
  else if (props.kind === 'empty' && props.icon === 'box') icon = <BoxIcon size={iconSize} />
  else if (props.kind === 'empty' && props.icon === 'search') icon = <SearchIcon size={iconSize} strokeWidth={1.3} />
  else icon = <InboxIcon size={iconSize} />
  return (
    <div role={error ? 'alert' : undefined} className={cx(styles.block, styles[variant], className)}>
      <span
        aria-hidden="true"
        className={cx(styles.icon, error ? styles.iconError : success ? styles.iconSuccess : styles.iconEmpty)}
      >
        {icon}
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

import { cx } from '../../../shared/lib'
import { ClockIcon, WarningIcon } from '../../../shared/ui'
import styles from './StockStatusBadge.module.css'

/** Статусы, которые показывает «Скоро закончится»; «Норма» и «Нет продаж» — в spec 6b. */
type LowStockStatus = 'critical' | 'soon'

const LABEL: Record<LowStockStatus, string> = { critical: 'Критично', soon: 'Скоро закончится' }

/** Бейдж запаса (DESIGN_SPEC § 4, «Бейджи»): цвет + иконка + текст — цвет не единственный сигнал. */
export function StockStatusBadge({ status }: { status: LowStockStatus }) {
  return (
    <span className={cx(styles.badge, styles[status])}>
      {status === 'critical' ? <WarningIcon size={12} strokeWidth={1.8} /> : <ClockIcon size={12} />}
      {LABEL[status]}
    </span>
  )
}

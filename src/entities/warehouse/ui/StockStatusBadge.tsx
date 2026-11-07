import { cx } from '../../../shared/lib'
import { CheckIcon, ClockIcon, NoSalesIcon, WarningIcon } from '../../../shared/ui'
import type { StockStatus } from '../model/schemas'
import { STOCK_STATUS_LABEL } from '../model/statusLabel'
import styles from './StockStatusBadge.module.css'

/** Иконка статуса: бейдж — 12, плитка «Остатков» — 18 (Stock.dc.html) */
export function StockStatusIcon({ status, size = 12 }: { status: StockStatus; size?: number }) {
  // В бейдже штрих толще, чем в плитке 18: так в макете
  const big = size > 12
  switch (status) {
    case 'critical':
      return <WarningIcon size={size} strokeWidth={big ? 1.6 : 1.8} />
    case 'soon':
      return <ClockIcon size={size} strokeWidth={big ? 1.6 : 1.8} />
    case 'ok':
      return <CheckIcon size={size} strokeWidth={big ? 1.8 : 2} />
    case 'noSales':
      return <NoSalesIcon size={size} strokeWidth={big ? 1.6 : 1.8} />
  }
}

/**
 * Бейдж запаса: цвет + иконка + текст — цвет не единственный сигнал.
 * sm — 20 / 11 («Скоро закончится», spec 007); md — 22 / 12 (страница «Остатки», spec 008).
 */
export function StockStatusBadge({ status, size = 'sm' }: { status: StockStatus; size?: 'sm' | 'md' }) {
  return (
    <span className={cx(styles.badge, size === 'md' && styles.md, styles[status])}>
      <StockStatusIcon status={status} />
      {STOCK_STATUS_LABEL[status]}
    </span>
  )
}

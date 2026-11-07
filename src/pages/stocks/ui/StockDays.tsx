import type { StockStatus } from '../../../entities/warehouse'
import { cx, formatStockDays } from '../../../shared/lib'
import { stockBarPercent } from '../model/stocksView'
import styles from './StockDays.module.css'

/** Дни запаса цветом статуса (AC-14): «3 дн.» или «—», если продаж нет. */
export function StockDaysValue({ stock, perDay, status, className }: { stock: number; perDay: number; status: StockStatus; className?: string }) {
  return <span className={cx(styles.value, styles[status], 'num', className)}>{formatStockDays(stock, perDay)}</span>
}

/** Полоса запаса 6 px, шкала 0–30 дней, цвет статуса (DESIGN_SPEC § 6). Число рядом — текстом. */
export function StockDaysBar({ days, status }: { days: number | null; status: StockStatus }) {
  return (
    <span aria-hidden="true" className={styles.track}>
      <span className={cx(styles.fill, styles[status])} style={{ width: `${stockBarPercent(days)}%` }} />
    </span>
  )
}

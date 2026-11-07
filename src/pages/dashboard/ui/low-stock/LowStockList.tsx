import { MarketplaceBadge, SchemeBadge } from '../../../../entities/marketplace'
import { StockStatusBadge } from '../../../../entities/warehouse'
import { cx, formatPieces, formatSpeed, formatStockDays } from '../../../../shared/lib'
import type { LowStockItem } from '../../model/lowStock'
import { ProductThumb } from '../top-products/ProductThumb'
import styles from './LowStockList.module.css'

/** Строки «товар × склад» (Dashboard.dc.html, блок low-h). Строки не фокусируются — деталей пока нет. */
export function LowStockList({ items }: { items: readonly LowStockItem[] }) {
  return (
    <ul className={styles.list}>
      {items.map((item) => (
        <li key={`${item.sku}|${item.warehouse}`} className={styles.row}>
          <ProductThumb size={40} />
          <div className={styles.main}>
            <span className={styles.name}>{item.name}</span>
            <span className={styles.meta}>
              <MarketplaceBadge marketplace={item.marketplace} size="sm" />
              {item.scheme && <SchemeBadge scheme={item.scheme} />}
              <span className={styles.warehouse}>{item.warehouse}</span>
              <span className={styles.numbers}>
                · {formatPieces(item.stock)} · {formatSpeed(item.perDay)}
              </span>
            </span>
          </div>
          <div className={styles.side}>
            <span className={cx(styles.days, styles[item.status])}>{formatStockDays(item.stock, item.perDay)}</span>
            <StockStatusBadge status={item.status} />
          </div>
        </li>
      ))}
    </ul>
  )
}

import { MarketplaceBadge } from '../../../../entities/marketplace'
import type { TopProduct } from '../../../../entities/product'
import { cx, formatInt, formatRub } from '../../../../shared/lib'
import { BuyoutValue } from './BuyoutValue'
import { ProductThumb } from './ProductThumb'
import styles from './TopProductsCards.module.css'

type TopProductsCardsProps = {
  items: readonly TopProduct[]
  /** Показаны строки прежней метрики, новая ещё грузится */
  busy: boolean
}

/** Топ на телефоне — карточки вместо таблицы (Dashboard.dc.html, `L.cards`; DESIGN_SPEC § 4). */
export function TopProductsCards({ items, busy }: TopProductsCardsProps) {
  return (
    <ol className={styles.list} aria-busy={busy || undefined}>
      {items.map((item, index) => (
        <li key={item.sku} className={styles.card}>
          <ProductThumb size={44} />
          <div className={styles.body}>
            <div className={styles.head}>
              <div className={styles.titles}>
                <span className={styles.name}>{item.name}</span>
                <span className={cx(styles.sub, 'num')}>{`№${index + 1} · Арт. ${item.sku}`}</span>
              </div>
              <MarketplaceBadge marketplace={item.marketplace} className={styles.badge} />
            </div>
            <dl className={styles.metrics}>
              <div className={styles.metric}>
                <dt className={styles.term}>Выручка</dt>
                <dd className={cx(styles.value, styles.main, 'num')}>{formatRub(item.revenue)}</dd>
              </div>
              <div className={styles.metric}>
                <dt className={styles.term}>Прибыль</dt>
                <dd className={cx(styles.value, styles.main, 'num')}>{formatRub(item.profit)}</dd>
              </div>
              <div className={styles.metric}>
                <dt className={styles.term}>Заказы</dt>
                <dd className={cx(styles.value, 'num')}>{formatInt(item.ordersCount)}</dd>
              </div>
              <div className={styles.metric}>
                <dt className={styles.term}>% выкупа</dt>
                <dd className={cx(styles.value, 'num')}>
                  <BuyoutValue value={item.buyoutRate} />
                </dd>
              </div>
            </dl>
          </div>
        </li>
      ))}
    </ol>
  )
}

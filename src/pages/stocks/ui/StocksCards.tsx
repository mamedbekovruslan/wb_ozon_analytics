import { useState } from 'react'
import { MarketplaceBadge, SchemeBadge } from '../../../entities/marketplace'
import { ProductThumb } from '../../../entities/product'
import { StockStatusBadge } from '../../../entities/warehouse'
import { cx, formatDecimal1, formatPieces } from '../../../shared/lib'
import { Button } from '../../../shared/ui'
import { CARDS_INITIAL, showMoreCount, type StockItem } from '../model/stocksView'
import { StockDaysBar, StockDaysValue } from './StockDays'
import styles from './StocksCards.module.css'

/**
 * Карточки остатков на телефоне (< 640, AC-17, AC-18): 8, затем «Показать ещё» по 20.
 * Сброс к 8 при смене плитки, поиска и фильтров — ключом компонента у страницы.
 */
export function StocksCards({ items }: { items: readonly StockItem[] }) {
  const [shown, setShown] = useState(CARDS_INITIAL)
  const more = showMoreCount(items.length, shown)

  return (
    <>
      <ul aria-label="Остатки" className={styles.list}>
        {items.slice(0, shown).map((item) => (
          <li key={`${item.sku}|${item.warehouse}`} className={styles.card}>
            <div className={styles.top}>
              <ProductThumb size={44} />
              <div className={styles.titles}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.meta}>
                  <MarketplaceBadge marketplace={item.marketplace} />
                  {item.scheme && <SchemeBadge scheme={item.scheme} size="md" />}
                  <span>{item.warehouse}</span>
                </span>
              </div>
            </div>
            <div className={styles.figures}>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Остаток</span>
                <span className={cx(styles.figureValue, styles.stock, 'num')}>{formatPieces(item.stock)}</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>В день</span>
                <span className={cx(styles.figureValue, styles.speed, 'num')}>{formatDecimal1(item.perDay)}</span>
              </div>
              <div className={styles.figure}>
                <span className={styles.figureLabel}>Запас</span>
                <StockDaysValue stock={item.stock} perDay={item.perDay} status={item.status} className={styles.figureValue} />
              </div>
            </div>
            <div className={styles.bottom}>
              <StockStatusBadge status={item.status} size="md" />
              <StockDaysBar days={item.days} status={item.status} />
            </div>
          </li>
        ))}
      </ul>
      {more > 0 && (
        <Button variant="secondary" className={styles.more} onClick={() => setShown(shown + more)}>
          Показать ещё {more}
        </Button>
      )}
    </>
  )
}

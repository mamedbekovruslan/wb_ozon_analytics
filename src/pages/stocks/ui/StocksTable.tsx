import { observeElementRect, useVirtualizer, type Virtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useRef } from 'react'
import { MarketplaceBadge, SchemeBadge } from '../../../entities/marketplace'
import { ProductThumb } from '../../../entities/product'
import { StockStatusBadge } from '../../../entities/warehouse'
import { cx, formatDecimal1, formatPieces, useMediaQuery } from '../../../shared/lib'
import { ArrowUpIcon } from '../../../shared/ui'
import type { StockItem } from '../model/stocksView'
import { StockDaysBar, StockDaysValue } from './StockDays'
import styles from './StocksTable.module.css'

const DESKTOP_QUERY = '(min-width: 1200px)'

/** Высота строки и видимой области (Stock.dc.html, L.rowH / L.tableH): десктоп и планшет */
const ROW_H = { wide: 52, narrow: 68 } as const
const VIEW_H = { wide: 620, narrow: 700 } as const

/** Строк за пределами видимой области — чтобы при быстрой прокрутке не мелькала пустота */
const OVERSCAN = 6

/**
 * Таблица остатков (≥ 640, AC-11 – AC-14). Строк около тысячи, поэтому в DOM — только видимые
 * (TanStack Virtual, решение пользователя 1). Строка — не ниже 52 / 68 и растёт по содержимому,
 * как в макете (на 768 склад с бейджами переносится): виртуализатор измеряет её фактическую высоту.
 */
export function StocksTable({ items, scrollResetKey }: { items: readonly StockItem[]; scrollResetKey: string }) {
  const wide = useMediaQuery(DESKTOP_QUERY)
  const layout = wide ? 'wide' : 'narrow'
  const scrollRef = useRef<HTMLDivElement>(null)

  // Для jsdom: там у элементов нет размеров, и без запасной высоты виртуализатор нарисовал бы
  // одну строку. В браузере у области со строками высота всегда больше 0
  const observeRect = useCallback(
    (instance: Virtualizer<HTMLDivElement, Element>, cb: (rect: { width: number; height: number }) => void) =>
      observeElementRect(instance, (rect) => cb(rect.height > 0 ? rect : { width: rect.width, height: VIEW_H.wide })),
    [],
  )

  // Предупреждение касается React Compiler, а он в проекте не включён (vite.config.ts)
  // oxlint-disable-next-line react/incompatible-library
  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_H[layout],
    overscan: OVERSCAN,
    observeElementRect: observeRect,
    getItemKey: (index) => `${items[index].sku}|${items[index].warehouse}`,
  })

  // Минимальная высота строки зависит от ширины (52 / 68): при смене раскладки перемерить
  useEffect(() => {
    virtualizer.measure()
  }, [virtualizer, layout])

  // Новая плитка или поиск — новый список: показать его с самых срочных строк
  useEffect(() => {
    virtualizer.scrollToOffset(0)
  }, [virtualizer, scrollResetKey])

  return (
    <section aria-label="Остатки по складам" className={styles.card}>
      <div role="table" aria-label="Остатки по складам" aria-rowcount={items.length + 1} className={cx(styles.table, styles[layout])}>
        <div role="rowgroup">
          <div role="row" aria-rowindex={1} className={cx(styles.grid, styles.head)}>
            <span role="columnheader">Товар</span>
            {wide && <span role="columnheader">Площадка</span>}
            <span role="columnheader">Склад</span>
            <span role="columnheader" className={styles.right}>
              Остаток
            </span>
            <span role="columnheader" className={styles.right}>
              {wide ? 'Продажи в день' : 'В день'}
            </span>
            {/* Сортировка постоянная — по дням запаса; пользователь её не меняет (AC-10) */}
            <span role="columnheader" aria-sort="ascending" className={styles.sorted}>
              {wide ? 'Дней запаса' : 'Запас · статус'}
              <ArrowUpIcon size={12} />
            </span>
            {wide && <span role="columnheader">Статус</span>}
          </div>
        </div>
        <div
          ref={scrollRef}
          role="rowgroup"
          tabIndex={0}
          aria-label="Список остатков, прокручивается"
          className={styles.scroll}
        >
          <div className={styles.spacer} style={{ height: virtualizer.getTotalSize() }}>
            {virtualizer.getVirtualItems().map((row) => {
              const item = items[row.index]
              return (
                <div
                  key={row.key}
                  ref={virtualizer.measureElement}
                  data-index={row.index}
                  role="row"
                  aria-rowindex={row.index + 2}
                  className={cx(styles.grid, styles.row)}
                  style={{ transform: `translateY(${row.start}px)` }}
                >
                  <span role="cell" className={styles.product}>
                    <ProductThumb size={36} />
                    <span className={styles.productText}>
                      <span className={styles.name}>{item.name}</span>
                      <span className={cx(styles.article, 'num')}>Арт. {item.sku}</span>
                    </span>
                  </span>
                  {wide && (
                    <span role="cell">
                      <MarketplaceBadge marketplace={item.marketplace} />
                    </span>
                  )}
                  <span role="cell" className={styles.warehouse}>
                    {!wide && <MarketplaceBadge marketplace={item.marketplace} />}
                    <span className={styles.warehouseName}>{item.warehouse}</span>
                    {item.scheme && <SchemeBadge scheme={item.scheme} size="md" />}
                  </span>
                  <span role="cell" className={cx(styles.right, styles.stock, 'num')}>
                    {formatPieces(item.stock)}
                  </span>
                  <span role="cell" className={cx(styles.right, styles.speed, 'num')}>
                    {formatDecimal1(item.perDay)}
                  </span>
                  <span role="cell" className={styles.daysCell}>
                    <span className={styles.days}>
                      <StockDaysValue stock={item.stock} perDay={item.perDay} status={item.status} className={styles.daysValue} />
                      <StockDaysBar days={item.days} status={item.status} />
                    </span>
                    {!wide && <StockStatusBadge status={item.status} size="md" />}
                  </span>
                  {wide && (
                    <span role="cell">
                      <StockStatusBadge status={item.status} size="md" />
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </section>
  )
}

import { useMemo, useState } from 'react'
import { useStocks, type StockStatus } from '../../../entities/warehouse'
import { MOBILE_QUERY, useFiltersSearch, useMediaQuery, useSetFiltersSearch } from '../../../shared/lib'
import { StateBlock } from '../../../shared/ui'
import { FilterBar } from '../../../widgets/filter-bar'
import { countByStatus, filterByStatus, searchStocks } from '../model/stocksView'
import { StatusTiles } from './StatusTiles'
import { StocksCards } from './StocksCards'
import { StocksHeader } from './StocksHeader'
import styles from './StocksPage.module.css'
import { StocksSearch } from './StocksSearch'
import { StocksSkeleton } from './StocksSkeleton'
import { StocksTable } from './StocksTable'

/**
 * Страница «Остатки» (spec 008, Stock.dc.html). Панель фильтров — здесь, пока нет шапки (как на
 * дашборде). Плитка статуса и поиск — состояние страницы, не URL (решение пользователя 3).
 */
export function StocksPage() {
  const search = useFiltersSearch()
  const setSearch = useSetFiltersSearch()
  const mp = search.mp ?? 'all'
  const cat = search.cat ?? []
  const stocks = useStocks({ mp, cat })
  const mobile = useMediaQuery(MOBILE_QUERY)
  const [status, setStatus] = useState<StockStatus | null>(null)
  const [query, setQuery] = useState('')

  const found = useMemo(() => (stocks.data ? searchStocks(stocks.data.items, query) : []), [stocks.data, query])
  const counts = useMemo(() => countByStatus(found), [found])
  const rows = useMemo(() => filterByStatus(found, status), [found, status])

  // Если упал лишь фоновый перезапрос, а данные есть, — таблица остаётся (AC-22)
  const failed = stocks.isError && !stocks.data
  const tilesState = failed ? 'error' : stocks.data ? 'ready' : 'loading'

  let content
  if (failed) {
    content = (
      <StateBlock
        kind="error"
        variant="page"
        title="Не удалось загрузить остатки"
        text="Проверьте соединение и повторите."
        onAction={() => void stocks.refetch()}
      />
    )
  } else if (!stocks.data) {
    content = <StocksSkeleton mobile={mobile} />
  } else if (stocks.data.items.length === 0) {
    content = (
      <StateBlock
        kind="empty"
        icon="box"
        variant="page"
        title="На складах ничего нет"
        text="По выбранным площадке и категориям остатков не найдено."
        actionLabel="Сбросить фильтры"
        onAction={() => setSearch({})}
      />
    )
  } else if (rows.length === 0) {
    content = (
      <StateBlock
        kind="empty"
        icon="search"
        variant="page"
        title="Ничего не найдено"
        text="Измените запрос или выберите другой статус."
        actionLabel="Сбросить поиск и статус"
        onAction={() => {
          setQuery('')
          setStatus(null)
        }}
      />
    )
  } else if (mobile) {
    // Ключ сбрасывает «Показать ещё» к 8 при смене плитки, поиска и фильтров (AC-18)
    content = <StocksCards key={`${status}|${query.trim()}|${mp}|${cat.join(',')}`} items={rows} />
  } else {
    content = <StocksTable items={rows} scrollResetKey={`${status}|${query.trim()}`} />
  }

  return (
    <>
      <FilterBar />
      <main className={styles.page}>
        <StocksHeader />
        <StatusTiles state={tilesState} counts={counts} selected={status} onSelect={setStatus} />
        <StocksSearch query={query} onQueryChange={setQuery} found={stocks.data ? rows.length : null} failed={failed} />
        {content}
      </main>
    </>
  )
}

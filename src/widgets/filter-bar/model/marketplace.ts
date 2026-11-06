import type { FiltersSearch, MarketplaceFilter } from '../../../shared/api'

/** Подписи в сводке мобильной полосы фильтров */
export const MARKETPLACE_SUMMARY: Record<MarketplaceFilter, string> = {
  all: 'Все площадки',
  wb: 'WB',
  ozon: 'Ozon',
}

/** «Все» — значение по умолчанию и в URL не пишется. */
export function withMarketplace(search: FiltersSearch, mp: MarketplaceFilter): FiltersSearch {
  const { mp: _mp, ...rest } = search
  return mp === 'all' ? rest : { ...rest, mp }
}

import { useFilters } from '../../../entities/marketplace'
import { useSetFiltersSearch } from '../../../shared/lib'
import { Button } from '../../../shared/ui'
import { withCategories } from '../model/category'
import { withMarketplace } from '../model/marketplace'
import { withCompare, withPreset } from '../model/period'
import { presetOf } from '../model/preset'
import { CategorySelect } from './CategorySelect'
import { CompareToggle } from './CompareToggle'
import { MarketplaceSegmented } from './MarketplaceSegmented'
import { PeriodSegmented } from './PeriodSegmented'
import { RangeButton } from './RangeButton'
import styles from './FilterPanel.module.css'

/** Панель фильтров ≥ 640 px (Chrome.dc.html): каждое изменение сразу пишется в URL новой записью истории. */
export function FilterPanel() {
  const { search, filters, meta, metaStatus } = useFilters()
  const setSearch = useSetFiltersSearch()
  const loading = metaStatus === 'pending'
  const mp = search.mp ?? 'all'

  return (
    <div role="search" aria-label="Фильтры" className={styles.panel}>
      <div className={styles.row} aria-busy={loading || undefined}>
        <div className={styles.period}>
          <PeriodSegmented value={presetOf(search, meta)} onChange={(preset) => setSearch(withPreset(search, preset))} />
          <RangeButton range={filters} loading={loading} />
        </div>
        <CompareToggle
          layout="bar"
          checked={search.cmp !== '0'}
          onChange={(compare) => setSearch(withCompare(search, compare))}
          prevRange={filters && { from: filters.prevFrom, to: filters.prevTo }}
          loading={loading}
        />
        <MarketplaceSegmented layout="bar" value={mp} onChange={(next) => setSearch(withMarketplace(search, next))} />
        <CategorySelect
          options={meta?.categories}
          loading={loading}
          value={search.cat ?? []}
          onApply={(cat) => setSearch(withCategories(search, cat))}
        />
        <span className={styles.spacer} />
        <Button variant="ghost" className={styles.reset} onClick={() => setSearch({})}>
          Сбросить фильтры
        </Button>
      </div>
    </div>
  )
}

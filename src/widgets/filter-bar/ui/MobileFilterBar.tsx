import { useRef, useState } from 'react'
import { useFilters } from '../../../entities/marketplace'
import { cx } from '../../../shared/lib'
import { Button, FilterIcon, Skeleton } from '../../../shared/ui'
import { categoriesCountLabel } from '../model/category'
import { MARKETPLACE_SUMMARY } from '../model/marketplace'
import { CUSTOM_PERIOD_LABEL, formatRangeShort, PERIOD_LABELS } from '../model/period'
import { presetOf } from '../model/preset'
import { FilterSheet } from './FilterSheet'
import styles from './MobileFilterBar.module.css'

/** Телефон (< 640 px): кнопка «Фильтры (N)» и сводка выбранного (Chrome.dc.html, AC-20). */
export function MobileFilterBar() {
  const { search, filters, meta, metaStatus } = useFilters()
  const [sheetOpen, setSheetOpen] = useState(false)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const loading = metaStatus === 'pending'

  const preset = presetOf(search, meta)
  const periodLabel = preset ? PERIOD_LABELS[preset] : CUSTOM_PERIOD_LABEL
  const compare = search.cmp !== '0'
  const categories = search.cat ?? []
  // Период выбран всегда, остальное — если отличается от значения по умолчанию
  const activeCount = 1 + (compare ? 1 : 0) + (search.mp ? 1 : 0) + (categories.length > 0 ? 1 : 0)
  const details = [MARKETPLACE_SUMMARY[search.mp ?? 'all'], categoriesCountLabel(categories.length)]
  if (compare) details.push('сравнение')

  const closeSheet = () => {
    setSheetOpen(false)
    buttonRef.current?.focus()
  }

  return (
    <div className={styles.bar} aria-busy={loading || undefined}>
      <Button
        ref={buttonRef}
        variant="secondary"
        className={styles.button}
        aria-haspopup="dialog"
        onClick={() => setSheetOpen(true)}
      >
        <FilterIcon />
        Фильтры ({activeCount})
      </Button>
      <span className={styles.summary}>
        {filters ? (
          <span className={cx(styles.line1, 'num')}>
            {`${periodLabel} · ${formatRangeShort(filters.from, filters.to)}`}
          </span>
        ) : (
          <span className={styles.line1}>
            {periodLabel}
            {loading && (
              <>
                {' · '}
                <Skeleton className={styles.skeleton} />
              </>
            )}
          </span>
        )}
        <span className={styles.line2}>{details.join(' · ')}</span>
      </span>
      {sheetOpen && <FilterSheet onClose={closeSheet} />}
    </div>
  )
}

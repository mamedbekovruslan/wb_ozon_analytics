import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react'
import { useFilters } from '../../../entities/marketplace'
import { resolveFilters, stringifySearchQuery, type FiltersSearch } from '../../../shared/api'
import { cx, formatRange, useSetFiltersSearch } from '../../../shared/lib'
import { Button, CloseIcon } from '../../../shared/ui'
import { withCategories } from '../model/category'
import { withMarketplace } from '../model/marketplace'
import { withCompare, withPreset } from '../model/period'
import { presetOf } from '../model/preset'
import { CategoryChips } from './CategoryChips'
import { CompareToggle } from './CompareToggle'
import { MarketplaceSegmented } from './MarketplaceSegmented'
import { PeriodChips } from './PeriodChips'
import styles from './FilterSheet.module.css'

/**
 * Bottom sheet фильтров на телефоне (Chrome.dc.html, AC-21). Всё меняется в черновике;
 * «Показать результаты» пишет его в URL одной записью истории, закрытие без кнопки — отмена.
 */
export function FilterSheet({ onClose }: { onClose: () => void }) {
  const { search, meta, metaStatus } = useFilters()
  const setSearch = useSetFiltersSearch()
  // Черновик создаётся при открытии листа из текущего URL
  const [draft, setDraft] = useState<FiltersSearch>(search)
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const draftFilters = meta ? resolveFilters(draft, meta) : null

  useEffect(() => {
    dialogRef.current?.querySelector('button')?.focus()
    // Страница под листом не прокручивается
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = overflow
    }
  }, [])

  const apply = () => {
    if (stringifySearchQuery(draft) !== stringifySearchQuery(search)) setSearch(draft)
    onClose()
  }

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      onClose()
      return
    }
    if (event.key !== 'Tab' || !dialogRef.current) return
    // Фокус не уходит со страницы под затемнением (aria-modal)
    const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button, input')]
    const first = focusable[0]
    const last = focusable.at(-1)
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last?.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first?.focus()
    }
  }

  return (
    <div
      className={styles.overlay}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        // Клик по тексту внутри листа оставляет фокус в диалоге — Esc и ловушка Tab продолжают работать
        tabIndex={-1}
        className={styles.sheet}
        onKeyDown={onKeyDown}
      >
        <div aria-hidden="true" className={styles.handle}>
          <span className={styles.handleBar} />
        </div>
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            Фильтры
          </h2>
          <Button variant="ghost" className={styles.close} aria-label="Закрыть фильтры" onClick={onClose}>
            <CloseIcon />
          </Button>
        </div>

        <div className={styles.body}>
          <section className={styles.section}>
            <span className={styles.heading}>Период</span>
            <PeriodChips value={presetOf(draft, meta)} onChange={(preset) => setDraft(withPreset(draft, preset))} />
            {draftFilters && (
              <span className={cx(styles.range, 'num')}>{formatRange(draftFilters.from, draftFilters.to)}</span>
            )}
          </section>
          <CompareToggle
            layout="sheet"
            checked={draft.cmp !== '0'}
            onChange={(compare) => setDraft(withCompare(draft, compare))}
            prevRange={draftFilters && { from: draftFilters.prevFrom, to: draftFilters.prevTo }}
            loading={metaStatus === 'pending'}
          />
          <section className={styles.section}>
            <span className={styles.heading}>Маркетплейс</span>
            <MarketplaceSegmented
              layout="sheet"
              value={draft.mp ?? 'all'}
              onChange={(mp) => setDraft(withMarketplace(draft, mp))}
            />
          </section>
          <CategoryChips
            options={meta?.categories}
            value={draft.cat ?? []}
            onChange={(cat) => setDraft(withCategories(draft, cat))}
          />
        </div>

        <div className={styles.footer}>
          <Button variant="secondary" className={styles.footerButton} onClick={() => setDraft({})}>
            Сбросить
          </Button>
          <Button variant="primary" className={cx(styles.footerButton, styles.submit)} onClick={apply}>
            Показать результаты
          </Button>
        </div>
      </div>
    </div>
  )
}

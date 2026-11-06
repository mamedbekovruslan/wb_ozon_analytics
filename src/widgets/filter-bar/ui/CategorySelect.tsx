import { useEffect, useRef, useState } from 'react'
import type { CategoryId } from '../../../shared/api'
import { cx, formatInt } from '../../../shared/lib'
import { Button, ChevronDownIcon, Skeleton } from '../../../shared/ui'
import { categoriesSummary, toggleCategory, type CategoryOption } from '../model/category'
import styles from './CategorySelect.module.css'

type CategorySelectProps = {
  /** Справочник из /api/meta; undefined — ещё грузится или не пришёл */
  options: readonly CategoryOption[] | undefined
  loading: boolean
  /** Выбранные категории из URL */
  value: readonly CategoryId[]
  onApply: (cat: CategoryId[]) => void
}

// Метки категорий --cat-1…8 — по порядку справочника
const COLOR_CLASSES = [styles.cat1, styles.cat2, styles.cat3, styles.cat4, styles.cat5, styles.cat6, styles.cat7, styles.cat8]

/**
 * Мультиселект «Категории». Отметки — черновик: URL меняется только по «Применить»;
 * Esc и клик вне списка закрывают без применения (spec 002, AC-19).
 */
export function CategorySelect({ options, loading, value, onApply }: CategorySelectProps) {
  const [draft, setDraft] = useState<CategoryId[] | null>(null)
  const open = draft !== null
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setDraft(null)
    buttonRef.current?.focus()
  }

  useEffect(() => {
    if (!open) return
    listRef.current?.querySelector('input')?.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    // click, а не mousedown: браузер переносит фокус на место клика после mousedown
    // и перебил бы возврат фокуса на кнопку «Категории»
    const onOutsideClick = (event: MouseEvent) => {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) close()
    }
    document.addEventListener('keydown', onKeyDown)
    document.addEventListener('click', onOutsideClick)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      document.removeEventListener('click', onOutsideClick)
    }
  }, [open])

  const apply = () => {
    if (draft) onApply(draft)
    close()
  }

  return (
    <div ref={rootRef} className={styles.root}>
      <Button
        ref={buttonRef}
        variant="secondary"
        className={cx(styles.trigger, open && styles.triggerOpen)}
        aria-haspopup="true"
        aria-expanded={open}
        disabled={!options}
        onClick={() => (open ? close() : setDraft([...value]))}
      >
        <span>Категории</span>
        {options && <span className={styles.summary}>{categoriesSummary(value, options)}</span>}
        {!options && loading && <Skeleton className={styles.summarySkeleton} />}
        <span className={cx(styles.count, 'num')}>{value.length}</span>
        <ChevronDownIcon className={styles.chevron} />
      </Button>

      {open && options && (
        // group, а не listbox из макета: внутри чекбоксы и кнопки, в listbox допустимы только option (ревью, 2026-11-06)
        <div ref={listRef} role="group" aria-label="Категории" className={styles.list}>
          {options.map((option, index) => (
            <label key={option.id} className={styles.option}>
              <input
                type="checkbox"
                className={styles.checkbox}
                checked={draft.includes(option.id)}
                onChange={() => setDraft(toggleCategory(draft, option.id, options))}
              />
              <span aria-hidden="true" className={cx(styles.dot, COLOR_CLASSES[index])} />
              <span className={styles.name}>{option.name}</span>
              <span className={cx(styles.productCount, 'num')}>{formatInt(option.productCount)}</span>
            </label>
          ))}
          <div className={styles.footer}>
            <Button variant="ghost" className={styles.footerButton} onClick={() => setDraft([])}>
              Очистить
            </Button>
            <Button variant="primary" className={styles.footerButton} onClick={apply}>
              Применить
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

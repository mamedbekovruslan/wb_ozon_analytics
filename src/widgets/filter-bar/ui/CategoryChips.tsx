import type { CategoryId } from '../../../shared/api'
import { CheckIcon, Chip } from '../../../shared/ui'
import { toggleCategory, type CategoryOption } from '../model/category'
import styles from './CategoryChips.module.css'

type CategoryChipsProps = {
  options: readonly CategoryOption[] | undefined
  value: readonly CategoryId[]
  onChange: (cat: CategoryId[]) => void
}

/** Категории в bottom sheet: заголовок с числом выбранных и чипы. */
export function CategoryChips({ options, value, onChange }: CategoryChipsProps) {
  return (
    <section className={styles.section}>
      <span className={styles.heading}>Категории · выбрано {value.length}</span>
      {options && (
        <div className={styles.chips}>
          {options.map((option) => {
            const on = value.includes(option.id)
            return (
              <Chip key={option.id} aria-pressed={on} onClick={() => onChange(toggleCategory(value, option.id, options))}>
                {on && <CheckIcon />}
                {option.name}
              </Chip>
            )
          })}
        </div>
      )}
    </section>
  )
}

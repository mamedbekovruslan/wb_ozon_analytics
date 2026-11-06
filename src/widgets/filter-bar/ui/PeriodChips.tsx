import type { PeriodPreset } from '../../../shared/api'
import { CalendarIcon, Chip } from '../../../shared/ui'
import { CUSTOM_PERIOD_LABEL, PERIOD_ITEMS } from '../model/period'
import styles from './PeriodChips.module.css'

type PeriodChipsProps = {
  /** null — выбран свой период */
  value: PeriodPreset | null
  onChange: (preset: PeriodPreset) => void
}

/** Период в bottom sheet: чипы пресетов и «Свой период» (не активен до фичи 2b, AC-23). */
export function PeriodChips({ value, onChange }: PeriodChipsProps) {
  return (
    <div role="group" aria-label="Период" className={styles.group}>
      {PERIOD_ITEMS.map((item) => (
        <Chip key={item.value} aria-pressed={item.value === value} onClick={() => onChange(item.value)}>
          {item.label}
        </Chip>
      ))}
      <Chip aria-disabled="true" className={styles.custom}>
        <CalendarIcon />
        {CUSTOM_PERIOD_LABEL}
      </Chip>
    </div>
  )
}

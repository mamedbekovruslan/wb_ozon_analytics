import type { PeriodPreset } from '../../../shared/api'
import { Segmented } from '../../../shared/ui'
import { PERIOD_ITEMS } from '../model/period'

type PeriodSegmentedProps = {
  /** null — выбран свой период */
  value: PeriodPreset | null
  onChange: (preset: PeriodPreset) => void
}

export function PeriodSegmented({ value, onChange }: PeriodSegmentedProps) {
  return <Segmented label="Период" items={PERIOD_ITEMS} value={value} onChange={onChange} size="sm" />
}

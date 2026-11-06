import { PERIOD_PRESETS, type FiltersSearch, type PeriodPreset } from '../../../shared/api'
import { formatDayMonth, parseDay } from '../../../shared/lib'

export const PERIOD_LABELS: Record<PeriodPreset, string> = {
  '7': '7 дней',
  '30': '30 дней',
  '90': '90 дней',
  q: 'Квартал',
  y: 'Год',
}

export const CUSTOM_PERIOD_LABEL = 'Свой период'

export const PERIOD_ITEMS = PERIOD_PRESETS.map((value) => ({ value, label: PERIOD_LABELS[value] }))

/** Выбор пресета: свой период снимается, «30 дней» — значение по умолчанию и в URL не пишется. */
export function withPreset(search: FiltersSearch, preset: PeriodPreset): FiltersSearch {
  const { period: _period, from: _from, to: _to, ...rest } = search
  return preset === '30' ? rest : { ...rest, period: preset }
}

export function withCompare(search: FiltersSearch, compare: boolean): FiltersSearch {
  const { cmp: _cmp, ...rest } = search
  return compare ? rest : { ...rest, cmp: '0' }
}

/** 05.10–03.11 — мобильная сводка */
export const formatRangeShort = (from: string, to: string) =>
  `${formatDayMonth(parseDay(from))}–${formatDayMonth(parseDay(to))}`

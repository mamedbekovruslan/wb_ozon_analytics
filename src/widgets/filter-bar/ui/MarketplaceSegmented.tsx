import type { MarketplaceFilter } from '../../../shared/api'
import { Segmented, type SegmentedItem } from '../../../shared/ui'
import styles from './MarketplaceSegmented.module.css'

// В панели у WB и Ozon цветная метка, в bottom sheet её нет — как в макете
const BAR_ITEMS: SegmentedItem<MarketplaceFilter>[] = [
  { value: 'all', label: 'Все' },
  { value: 'wb', label: 'WB', dotClassName: styles.wb },
  { value: 'ozon', label: 'Ozon', dotClassName: styles.ozon },
]

const SHEET_ITEMS: SegmentedItem<MarketplaceFilter>[] = BAR_ITEMS.map(({ value, label }) => ({ value, label }))

type MarketplaceSegmentedProps = {
  value: MarketplaceFilter
  onChange: (mp: MarketplaceFilter) => void
  layout: 'bar' | 'sheet'
}

export function MarketplaceSegmented({ value, onChange, layout }: MarketplaceSegmentedProps) {
  return (
    <Segmented
      label="Маркетплейс"
      items={layout === 'bar' ? BAR_ITEMS : SHEET_ITEMS}
      value={value}
      onChange={onChange}
      size={layout === 'bar' ? 'md' : 'lg'}
    />
  )
}

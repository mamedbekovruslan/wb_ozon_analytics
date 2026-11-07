import type { MarketplaceId } from '../../../shared/api'
import { cx } from '../../../shared/lib'
import styles from './MarketplaceBadge.module.css'

const LABEL: Record<MarketplaceId, string> = { wb: 'WB', ozon: 'Ozon' }

type MarketplaceBadgeProps = {
  marketplace: MarketplaceId
  /** md — таблицы (20, 12/600); sm — строка под названием товара (18, 11/600), «Скоро закончится» */
  size?: 'md' | 'sm'
  className?: string
}

/** Бейдж площадки (DESIGN_SPEC § 4, «Бейджи»): бренды — только текстом и цветом серии. */
export function MarketplaceBadge({ marketplace, size = 'md', className }: MarketplaceBadgeProps) {
  return <span className={cx(styles.badge, styles[size], styles[marketplace], className)}>{LABEL[marketplace]}</span>
}

import type { MarketplaceId } from '../../../shared/api'
import { cx } from '../../../shared/lib'
import styles from './MarketplaceBadge.module.css'

const LABEL: Record<MarketplaceId, string> = { wb: 'WB', ozon: 'Ozon' }

/** Бейдж площадки (DESIGN_SPEC § 4, «Бейджи»): бренды — только текстом и цветом серии. */
export function MarketplaceBadge({ marketplace, className }: { marketplace: MarketplaceId; className?: string }) {
  return <span className={cx(styles.badge, styles[marketplace], className)}>{LABEL[marketplace]}</span>
}

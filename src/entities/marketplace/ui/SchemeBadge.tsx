import { cx } from '../../../shared/lib'
import styles from './SchemeBadge.module.css'

/** Подсказка при наведении (Stock.dc.html): смысл схемы виден и без неё — по тексту FBO / FBS */
const HINT = { FBO: 'Хранение и доставка — Ozon', FBS: 'Хранение и сборка — продавец' } as const

/**
 * Схема работы Ozon — FBO / FBS (DESIGN_SPEC § 4, «Бейджи»): контурный, без фона.
 * У WB схема в продукте не показывается (docs/domain.md) — решает место использования.
 * sm — 18 («Скоро закончится», spec 007); md — 20 (страница «Остатки», spec 008) с подсказкой.
 */
export function SchemeBadge({ scheme, size = 'sm' }: { scheme: 'FBO' | 'FBS'; size?: 'sm' | 'md' }) {
  return (
    <span className={cx(styles.badge, size === 'md' && styles.md)} title={size === 'md' ? HINT[scheme] : undefined}>
      {scheme}
    </span>
  )
}

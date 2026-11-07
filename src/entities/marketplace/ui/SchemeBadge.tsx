import styles from './SchemeBadge.module.css'

/**
 * Схема работы Ozon — FBO / FBS (DESIGN_SPEC § 4, «Бейджи»): контурный, без фона.
 * У WB схема в продукте не показывается (docs/domain.md) — решает место использования.
 */
export function SchemeBadge({ scheme }: { scheme: 'FBO' | 'FBS' }) {
  return <span className={styles.badge}>{scheme}</span>
}

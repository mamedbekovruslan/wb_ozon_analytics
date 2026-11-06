import { cx } from '../../lib/cx'
import styles from './Skeleton.module.css'

/** Статичная заглушка без шиммера (DESIGN_SPEC § 4). Размер задаёт место использования; aria-busy — на контейнере. */
export function Skeleton({ className }: { className?: string }) {
  return <span aria-hidden="true" className={cx(styles.skeleton, className)} />
}

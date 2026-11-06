import { cx } from '../../lib/cx'
import styles from './Switch.module.css'

type SwitchProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** md — панель (36 × 20), lg — bottom sheet (44 × 26) */
  size: 'md' | 'lg'
}

export function Switch({ label, checked, onChange, size }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className={cx(styles.switch, styles[size])}
      onClick={() => onChange(!checked)}
    >
      <span aria-hidden="true" className={styles.knob} />
    </button>
  )
}

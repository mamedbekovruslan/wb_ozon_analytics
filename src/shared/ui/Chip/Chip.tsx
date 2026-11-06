import type { ComponentProps } from 'react'
import { cx } from '../../lib/cx'
import styles from './Chip.module.css'

type ChipProps = ComponentProps<'button'>

/** Чип 44 px из bottom sheet (Chrome.dc.html); выбранный — по aria-pressed. */
export function Chip({ className, type = 'button', ...rest }: ChipProps) {
  return <button type={type} className={cx(styles.chip, className)} {...rest} />
}

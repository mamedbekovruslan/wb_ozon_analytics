import type { ComponentProps } from 'react'
import { cx } from '../../lib/cx'
import styles from './Button.module.css'

type ButtonProps = ComponentProps<'button'> & {
  /** DESIGN_SPEC § 4: основная, вторичная, призрачная */
  variant: 'primary' | 'secondary' | 'ghost'
}

/** Цвета и состояния кнопки; размеры и отступы задаёт место использования через className. */
export function Button({ variant, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cx(styles.button, styles[variant], className)} {...rest} />
}

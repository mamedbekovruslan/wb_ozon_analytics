import { cx, formatDelta, type Change } from '../../lib'
import { ArrowDownIcon, ArrowUpIcon } from '../icons'
import styles from './DeltaBadge.module.css'

const SR_TEXT = {
  up: { good: 'рост к прошлому периоду, хорошо', bad: 'рост к прошлому периоду, плохо' },
  down: { good: 'снижение к прошлому периоду, хорошо', bad: 'снижение к прошлому периоду, плохо' },
} as const

/**
 * Бейдж изменения (DESIGN_SPEC § 4): стрелка + знак + цвет, цвет никогда не единственный сигнал.
 * Скрытый текст говорит скринридеру, хорошо это или плохо.
 */
export function DeltaBadge({ change }: { change: Change }) {
  const sr =
    change.direction === 'flat' || change.tone === 'neutral'
      ? 'без изменений к прошлому периоду'
      : SR_TEXT[change.direction][change.tone]
  return (
    <span className={cx(styles.badge, styles[change.tone], 'num')}>
      {change.direction === 'up' && <ArrowUpIcon />}
      {change.direction === 'down' && <ArrowDownIcon />}
      {formatDelta(change.percent)}
      <span className="sr-only"> {sr}</span>
    </span>
  )
}

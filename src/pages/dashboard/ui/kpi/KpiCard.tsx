import { cx, type Change } from '../../../../shared/lib'
import { DeltaBadge, Sparkline } from '../../../../shared/ui'
import styles from './KpiCard.module.css'

type KpiCardProps = {
  label: string
  value: string
  /** «было X»; null — не показывать (сравнение выключено или не десктоп) */
  previous: string | null
  /** null — бейджа нет (сравнение выключено или изменение не посчитать) */
  change: Change | null
  points: readonly (number | null)[]
}

/** KPI-карточка (DESIGN_SPEC § 4): подпись → значение → бейдж, «было» и sparkline. */
export function KpiCard({ label, value, previous, change, points }: KpiCardProps) {
  return (
    <article className={styles.card}>
      <h3 className={styles.label}>{label}</h3>
      <div className={cx(styles.value, 'num')}>{value}</div>
      <div className={styles.footer}>
        <div className={styles.compare}>
          {change && <DeltaBadge change={change} />}
          {previous !== null && <span className={cx(styles.previous, 'num')}>было {previous}</span>}
        </div>
        <Sparkline points={points} tone={change?.tone ?? null} className={styles.sparkline} />
      </div>
    </article>
  )
}

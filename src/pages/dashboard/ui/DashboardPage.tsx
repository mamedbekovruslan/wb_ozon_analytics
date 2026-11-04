import { useQuery } from '@tanstack/react-query'
import { getHealth } from '../../../shared/api'
import { formatDelta, formatPercent, formatRub, formatRubShort, formatTooltipDate } from '../../../shared/lib'
import styles from './DashboardPage.module.css'

// Временная страница для ручной проверки токенов, форматтеров и цепочки
// Router → Query → MSW. Заменится дашбордом на этапе 2.
export function DashboardPage() {
  const health = useQuery({
    queryKey: ['health'],
    queryFn: ({ signal }) => getHealth(signal),
  })

  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Аналитика продавца WB + Ozon</h1>
      <p className={styles.hint}>Каркас приложения. Дашборд появится на этапе 2.</p>
      <p className={styles.hint}>
        Фейковый API:{' '}
        {health.isPending && 'проверяем…'}
        {health.isError && <span className={styles.down}>недоступен</span>}
        {health.isSuccess && <span className={styles.up}>работает</span>}
      </p>
      <ul className={`${styles.list} num`}>
        <li>{formatRub(1234567)}</li>
        <li>{formatRubShort(1234567)}</li>
        <li>{formatPercent(87.4)}</li>
        <li className={styles.up}>{formatDelta(12.4)}</li>
        <li className={styles.down}>{formatDelta(-5.5)}</li>
        <li>{formatTooltipDate(new Date(2026, 9, 28))}</li>
      </ul>
    </main>
  )
}

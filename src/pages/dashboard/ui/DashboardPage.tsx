import { useMeta } from '../../../entities/marketplace'
import { formatDelta, formatPercent, formatRub, formatRubShort, formatTooltipDate } from '../../../shared/lib'
import { FilterBar } from '../../../widgets/filter-bar'
import styles from './DashboardPage.module.css'

// Временная страница для ручной проверки токенов, форматтеров и цепочки
// Router → Query → MSW. Заменится дашбордом на этапе 2. Панель фильтров
// стоит здесь, пока нет шапки (spec 002).
export function DashboardPage() {
  const meta = useMeta()

  return (
    <>
      <FilterBar />
      <main className={styles.page}>
        <h1 className={styles.title}>Аналитика продавца WB + Ozon</h1>
        <p className={styles.hint}>Каркас приложения. Дашборд появится на этапе 2.</p>
        <p className={styles.hint}>
          Фейковый API:{' '}
          {meta.isPending && 'проверяем…'}
          {meta.isError && <span className={styles.down}>недоступен</span>}
          {meta.isSuccess && <span className={styles.up}>работает</span>}
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
    </>
  )
}

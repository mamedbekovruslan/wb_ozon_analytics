import { formatDelta, formatPercent, formatRub, formatRubShort, formatTooltipDate } from '../shared/lib'
import styles from './App.module.css'

// Временная страница для ручной проверки токенов, шрифта и форматтеров.
// Заменится роутером и страницей dashboard на следующих шагах этапа 1.
export function App() {
  return (
    <main className={styles.page}>
      <h1 className={styles.title}>Аналитика продавца WB + Ozon</h1>
      <p className={styles.hint}>Каркас приложения. Дашборд появится на этапе 2.</p>
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

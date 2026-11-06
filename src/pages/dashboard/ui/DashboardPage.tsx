import { FilterBar } from '../../../widgets/filter-bar'
import { DashboardHeader } from './DashboardHeader'
import styles from './DashboardPage.module.css'
import { KpiPanel } from './kpi/KpiPanel'

// Панель фильтров стоит здесь, пока нет шапки (spec 002). График, «Скоро закончится»
// и топ товаров появятся в фичах 4–6 под KPI (DESIGN_SPEC § 2) — тоже внутри страницы,
// пока они нужны только дашборду (ADR-0003, «сначала страница»).
export function DashboardPage() {
  return (
    <>
      <FilterBar />
      <main className={styles.page}>
        <DashboardHeader />
        <KpiPanel />
      </main>
    </>
  )
}

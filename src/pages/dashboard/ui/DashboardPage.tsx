import { FilterBar } from '../../../widgets/filter-bar'
import { DashboardHeader } from './DashboardHeader'
import styles from './DashboardPage.module.css'
import { KpiPanel } from './kpi/KpiPanel'
import { SalesChartPanel } from './sales-chart/SalesChartPanel'

// Панель фильтров стоит здесь, пока нет шапки (spec 002). Блоки дашборда — внутри страницы,
// пока они нужны только ей (ADR-0003, «сначала страница»). График пока на всю ширину;
// в фиче 6 рядом встанет «Скоро закончится» (DESIGN_SPEC § 2, spec 005).
export function DashboardPage() {
  return (
    <>
      <FilterBar />
      <main className={styles.page}>
        <DashboardHeader />
        <KpiPanel />
        <SalesChartPanel />
      </main>
    </>
  )
}

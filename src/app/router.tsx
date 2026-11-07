import { createRootRoute, createRoute, createRouter, redirect, type RouterHistory } from '@tanstack/react-router'
import { DashboardPage } from '../pages/dashboard'
import { StocksPage } from '../pages/stocks'
import { parseFiltersSearch, parseSearchQuery, stringifySearchQuery } from '../shared/api'
import { RootLayout } from './RootLayout'

// Маршруты описаны кодом, без генератора файлового роутинга — меньше зависимостей.
// Фильтры (spec 002, ADR-0007, ADR-0015) — на корневом маршруте: они общие для всех страниц.

function createRouteTree() {
  const rootRoute = createRootRoute({
    // Мусор в URL не ломает страницу: невалидное → значение по умолчанию (T4)
    validateSearch: parseFiltersSearch,
    beforeLoad: ({ search, location }) => {
      // Адрес приводится к чистому виду заменой записи: «Назад» не ведёт обратно к мусору (AC-10).
      // Роутер кладёт проверенные значения поверх сырых параметров, а не вместо них, —
      // поэтому чистый вид считается заново
      const clean = stringifySearchQuery(parseFiltersSearch(search))
      if (clean !== location.searchStr) {
        const hash = location.hash ? `#${location.hash}` : ''
        throw redirect({ href: `${location.pathname}${clean}${hash}`, replace: true })
      }
    },
    component: RootLayout,
  })

  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    beforeLoad: ({ location }) => {
      // Параметры фильтров переходят на дашборд вместе с адресом (AC-11)
      throw redirect({ href: `/dashboard${location.searchStr}`, replace: true })
    },
  })

  const dashboardRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/dashboard',
    component: DashboardPage,
  })

  const stocksRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/stocks',
    component: StocksPage,
  })

  return rootRoute.addChildren([indexRoute, dashboardRoute, stocksRoute])
}

/** Фабрика нужна тестам: у каждого свой роутер и своя история (createMemoryHistory). */
export function createAppRouter(options: { history?: RouterHistory } = {}) {
  return createRouter({
    routeTree: createRouteTree(),
    history: options.history,
    // Значения в URL — обычный текст, категории повторяются: ?mp=wb&cat=shoes&cat=sports
    parseSearch: parseSearchQuery,
    stringifySearch: stringifySearchQuery,
  })
}

export const router = createAppRouter()

// Регистрация даёт типизированные ссылки и search params во всём приложении
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

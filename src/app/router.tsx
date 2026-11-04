import { createRootRoute, createRoute, createRouter, Outlet, redirect } from '@tanstack/react-router'
import { DashboardPage } from '../pages/dashboard'

// Маршруты описаны кодом, без генератора файлового роутинга — меньше зависимостей.
// Схема фильтров в URL (ADR-0007) добавится фичей «Фильтры в URL».
const rootRoute = createRootRoute({
  component: Outlet,
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/dashboard' })
  },
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: DashboardPage,
})

const routeTree = rootRoute.addChildren([indexRoute, dashboardRoute])

export const router = createRouter({ routeTree })

// Регистрация даёт типизированные ссылки и search params во всём приложении
declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

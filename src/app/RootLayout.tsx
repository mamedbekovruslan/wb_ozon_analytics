import { Outlet } from '@tanstack/react-router'
import { FiltersUrlSync } from './FiltersUrlSync'

export function RootLayout() {
  return (
    <>
      <FiltersUrlSync />
      <Outlet />
    </>
  )
}

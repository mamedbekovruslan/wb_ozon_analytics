import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // mocks/ — фейковый backend, а не слой FSD (ADR-0004), его границы steiger не проверяет
    ignores: ['./src/mocks/**'],
  },
  {
    // Временно (решение пользователя 2026-11-05, spec 001): схемы ответов API
    // лежат в entities по ADR-0010. sale уже используется (spec 004), product и
    // warehouse — ещё нет. Вернуть 'error' после фич «Топ товаров» и «Остатки».
    files: ['./src/entities/**'],
    rules: { 'fsd/insignificant-slice': 'warn' },
  },
  {
    // Временно (решение пользователя 2026-11-06, spec 002): панель фильтров общая
    // для всех страниц, но пока страница одна — дашборд. Вернуть 'error', когда
    // filter-bar встанет на страницы «Заказы» или «Остатки».
    files: ['./src/widgets/filter-bar/**'],
    rules: { 'fsd/insignificant-slice': 'warn' },
  },
])

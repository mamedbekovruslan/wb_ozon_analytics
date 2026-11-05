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
    // лежат в entities по ADR-0010, а использовать их начнут виджеты фич 3–7.
    // Вернуть 'error' в фиче KPI-карточек, когда схемы появятся в коде UI.
    files: ['./src/entities/**'],
    rules: { 'fsd/insignificant-slice': 'warn' },
  },
])

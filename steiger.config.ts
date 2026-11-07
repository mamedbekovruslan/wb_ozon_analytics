import { defineConfig } from 'steiger'
import fsd from '@feature-sliced/steiger-plugin'

export default defineConfig([
  ...fsd.configs.recommended,
  {
    // mocks/ — фейковый backend, а не слой FSD (ADR-0004), его границы steiger не проверяет
    ignores: ['./src/mocks/**'],
  },
])

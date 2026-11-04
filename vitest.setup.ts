// Общая подготовка для всех unit- и интеграционных тестов (vite.config.ts → test.setupFiles).
// Лежит вне src/: это настройка инструмента, а не код приложения, слоям FSD не принадлежит.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Без globals: true Testing Library не очищает DOM сама — делаем явно,
// иначе разметка одного теста видна в следующем
afterEach(() => {
  cleanup()
})

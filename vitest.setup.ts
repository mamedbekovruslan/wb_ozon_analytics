// Общая подготовка для всех unit- и интеграционных тестов (vite.config.ts → test.setupFiles).
// Лежит вне src/: это настройка инструмента, а не код приложения, слоям FSD не принадлежит.
import '@testing-library/jest-dom/vitest'
import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Без globals: true Testing Library не очищает DOM сама — делаем явно,
// иначе разметка одного теста видна в следующем
afterEach(async () => {
  cleanup()
  // Отменённые при размонтировании запросы (например, с delay('infinite')) MSW в Node
  // завершает асинхронно. Если следующий тест начнётся раньше, его запросы иногда уходят
  // мимо перехвата в настоящую сеть. Даём им завершиться. Подробности и когда убрать —
  // docs/specs/005-график-продаж.md, раздел «Разбор падений тестов».
  await new Promise((resolve) => setTimeout(resolve, 20))
})

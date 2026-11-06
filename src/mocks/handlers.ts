import { delay, http, HttpResponse, type JsonBodyType } from 'msw'
import { PROJECT_SEED } from './seed'
import { API_PATHS, createApiCore } from './server/core'

// MSW-обработчики, которые выполняют ядро фейкового BFF в том же потоке.
// Используются в Node-тестах; в браузере ядро работает в Web Worker
// (browser.ts, ADR-0016).


export function createHandlers({ seed, now }: { seed: number; now: Date }) {
  const core = createApiCore({ seed, now })

  // Только известные пути: неизвестный /api/... остаётся необработанным, как раньше
  return API_PATHS.map((path) =>
    http.get(path, async ({ request }) => {
      // Небольшая задержка: в браузере видны состояния загрузки, в Node почти мгновенно
      await delay()
      const { status, body } = core.handle(path, new URL(request.url).search)
      // Ядро отдаёт результат JSON.stringify-совместимым (агрегаты из чисел и строк)
      return HttpResponse.json(body as JsonBodyType, { status })
    }),
  )
}

export const handlers = createHandlers({ seed: PROJECT_SEED, now: new Date() })

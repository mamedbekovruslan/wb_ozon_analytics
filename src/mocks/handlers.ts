import { delay, http, HttpResponse } from 'msw'

// Обработчики фейкового BFF (ADR-0004, ADR-0010). Реальные эндпоинты /api/...
// появятся вместе с генератором данных; health — проверка, что цепочка
// «fetch → MSW → ответ» работает.
export const handlers = [
  http.get('/api/health', async () => {
    // Небольшая задержка, чтобы было видно состояние загрузки
    await delay(300)
    return HttpResponse.json({ status: 'ok' })
  }),
]

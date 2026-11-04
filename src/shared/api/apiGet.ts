import type { z } from 'zod'

// Ошибка запроса к нашему API: UI показывает состояние ошибки, а не падает (security.md, T5)
export class ApiError extends Error {
  readonly status: number | null

  constructor(message: string, status: number | null = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// GET к нашему BFF. Ответ проверяется zod-схемой: если форма данных
// неожиданная, это ошибка запроса, а не тихо испорченный интерфейс.
export async function apiGet<T extends z.ZodType>(
  path: string,
  schema: T,
  signal?: AbortSignal,
): Promise<z.infer<T>> {
  const response = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  if (!response.ok) {
    throw new ApiError(`Запрос ${path} завершился с кодом ${response.status}`, response.status)
  }

  // Вместо JSON может прийти HTML (например, dev-сервер отдал index.html на
  // неизвестный адрес). Это тоже ошибка API, а не SyntaxError из глубины кода
  let body: unknown
  try {
    body = await response.json()
  } catch (error) {
    // Отмену запроса (signal) не маскируем: TanStack Query обрабатывает её сам
    if (error instanceof DOMException && error.name === 'AbortError') throw error
    throw new ApiError(`Ответ ${path} — не JSON`, response.status)
  }

  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    throw new ApiError(`Ответ ${path} не совпал с контрактом API`)
  }
  return parsed.data
}

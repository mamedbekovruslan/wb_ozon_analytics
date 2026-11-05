// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { ApiError, apiGet } from './index'

/*
 * Контракт apiGet (инфраструктура, без spec):
 * K-1  200 + JSON по схеме → данные, прошедшие схему.
 * K-2  не 2xx → ApiError со status = код ответа.
 * K-3  200 + JSON не по схеме → ApiError со status = null.
 * K-4  200 + тело не JSON → ApiError (не SyntaxError) со status = 200.
 * K-5  AbortError из fetch или чтения тела пробрасывается как есть.
 * K-6  в fetch уходят path, signal и заголовок Accept: application/json.
 * AC-27 (spec 001) сетевая ошибка fetch (не отмена) → ApiError со status = null.
 */

const schema = z.object({ id: z.number(), name: z.string() })

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })

type FetchImpl = (input: string, init?: RequestInit) => Promise<Response>

function mockFetch(impl: FetchImpl) {
  const fetchMock = vi.fn<FetchImpl>(impl)
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('apiGet', () => {
  it('K-1: при 200 и валидном JSON возвращает данные', async () => {
    mockFetch(async () => jsonResponse({ id: 1, name: 'Футболка' }))

    await expect(apiGet('/api/item', schema)).resolves.toEqual({ id: 1, name: 'Футболка' })
  })

  it('K-1: возвращает результат схемы, а не сырой JSON (лишние поля отброшены)', async () => {
    mockFetch(async () => jsonResponse({ id: 1, name: 'Футболка', secret: 'x' }))

    const data = await apiGet('/api/item', schema)

    expect(data).not.toHaveProperty('secret')
  })

  it('K-2: при ответе 500 отклоняется с ApiError и status = 500', async () => {
    mockFetch(async () => jsonResponse({ message: 'fail' }, 500))

    const error = await apiGet('/api/item', schema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ name: 'ApiError', status: 500 })
  })

  it('K-2: при ответе 404 отклоняется с ApiError и status = 404', async () => {
    mockFetch(async () => new Response('Not found', { status: 404 }))

    await expect(apiGet('/api/item', schema)).rejects.toMatchObject({
      name: 'ApiError',
      status: 404,
    })
  })

  it('K-3: при JSON, не подходящем под схему, отклоняется с ApiError и status = null', async () => {
    mockFetch(async () => jsonResponse({ id: 'один', name: 42 }))

    const error = await apiGet('/api/item', schema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: null })
  })

  it('K-4: при HTML вместо JSON отклоняется с ApiError (не SyntaxError) и status = 200', async () => {
    mockFetch(
      async () =>
        new Response('<!doctype html><html><body>index</body></html>', {
          status: 200,
          headers: { 'Content-Type': 'text/html' },
        }),
    )

    const error = await apiGet('/api/item', schema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).not.toBeInstanceOf(SyntaxError)
    expect(error).toMatchObject({ status: 200 })
  })

  it('K-4: при пустом теле ответа 200 отклоняется с ApiError', async () => {
    mockFetch(async () => new Response('', { status: 200 }))

    await expect(apiGet('/api/item', schema)).rejects.toBeInstanceOf(ApiError)
  })

  it('K-5: если fetch отклоняется с AbortError, пробрасывает именно её', async () => {
    const abortError = new DOMException('Запрос отменён', 'AbortError')
    mockFetch(async () => {
      throw abortError
    })

    await expect(apiGet('/api/item', schema)).rejects.toBe(abortError)
  })

  it('K-5: если чтение тела отклоняется с AbortError, пробрасывает именно её', async () => {
    const abortError = new DOMException('Запрос отменён', 'AbortError')
    const body = new ReadableStream({
      start(controller) {
        controller.error(abortError)
      },
    })
    mockFetch(async () => new Response(body, { status: 200 }))

    const error = await apiGet('/api/item', schema).catch((e: unknown) => e)

    expect(error).not.toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ name: 'AbortError' })
  })

  it('AC-27: если fetch отклонён сетевой ошибкой (TypeError), отклоняется с ApiError и status = null', async () => {
    mockFetch(async () => {
      throw new TypeError('Failed to fetch')
    })

    const error = await apiGet('/api/item', schema).catch((e: unknown) => e)

    expect(error).toBeInstanceOf(ApiError)
    expect(error).toBeInstanceOf(Error)
    expect(error).not.toBeInstanceOf(TypeError)
    expect(error).toMatchObject({ name: 'ApiError', status: null })
  })

  it('AC-27: любая другая ошибка fetch (не отмена) тоже превращается в ApiError со status = null', async () => {
    mockFetch(async () => {
      throw new Error('ECONNRESET')
    })

    await expect(apiGet('/api/item', schema)).rejects.toMatchObject({ name: 'ApiError', status: null })
  })

  it('AC-27: отмена (AbortError) по-прежнему пробрасывается как есть, а не оборачивается в ApiError', async () => {
    const controller = new AbortController()
    const abortError = new DOMException('Запрос отменён', 'AbortError')
    mockFetch(async () => {
      throw abortError
    })
    controller.abort()

    const error = await apiGet('/api/item', schema, controller.signal).catch((e: unknown) => e)

    expect(error).toBe(abortError)
    expect(error).not.toBeInstanceOf(ApiError)
  })

  it('K-6: передаёт в fetch path, signal и заголовок Accept', async () => {
    const fetchMock = mockFetch(async () => jsonResponse({ id: 1, name: 'Футболка' }))
    const { signal } = new AbortController()

    await apiGet('/api/sales?period=7d', schema, signal)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/sales?period=7d',
      expect.objectContaining({
        signal,
        headers: expect.objectContaining({ Accept: 'application/json' }),
      }),
    )
  })
})

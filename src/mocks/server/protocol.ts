import { z } from 'zod'

// Сообщения между основным потоком и воркером фейкового API (spec 003,
// «Данные и API»). Каждая сторона проверяет входящие zod-схемой: сообщение
// неверной формы игнорируется, а не роняет обработчик.

export const initMessage = z.object({
  type: z.literal('init'),
  seed: z.number().int(),
  /** «Сейчас» основного потока, мс: от него считается «сегодня» */
  now: z.number(),
})

export const requestMessage = z.object({
  type: z.literal('request'),
  id: z.number().int(),
  path: z.string(),
  search: z.string(),
})

export const responseMessage = z.object({
  type: z.literal('response'),
  id: z.number().int(),
  status: z.number().int().min(100).max(599),
  body: z.unknown(),
})

export type InitMessage = z.infer<typeof initMessage>
export type RequestMessage = z.infer<typeof requestMessage>
export type ResponseMessage = z.infer<typeof responseMessage>

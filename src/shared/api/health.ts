import { z } from 'zod'
import { apiGet } from './apiGet'

const healthSchema = z.object({ status: z.literal('ok') })

export type Health = z.infer<typeof healthSchema>

export function getHealth(signal?: AbortSignal): Promise<Health> {
  return apiGet('/api/health', healthSchema, signal)
}

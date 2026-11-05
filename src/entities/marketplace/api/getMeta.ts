import { apiGet } from '../../../shared/api'
import { metaResponseSchema, type MetaResponse } from '../model/meta'

export function getMeta(signal?: AbortSignal): Promise<MetaResponse> {
  return apiGet('/api/meta', metaResponseSchema, signal)
}

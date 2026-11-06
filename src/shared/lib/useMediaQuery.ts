import { useCallback, useSyncExternalStore } from 'react'

/** Телефон по сетке дизайна: < 640 px (DESIGN_SPEC § 2). */
export const MOBILE_QUERY = '(max-width: 639px)'

// Без matchMedia (старый браузер, jsdom) считаем, что запрос не совпал
const getMatcher = (query: string) => (typeof window.matchMedia === 'function' ? window.matchMedia(query) : null)

export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onChange: () => void) => {
      const matcher = getMatcher(query)
      matcher?.addEventListener('change', onChange)
      return () => matcher?.removeEventListener('change', onChange)
    },
    [query],
  )
  return useSyncExternalStore(subscribe, () => getMatcher(query)?.matches ?? false)
}

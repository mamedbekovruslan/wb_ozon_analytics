import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Ширина элемента в px и её изменения. Графикам нужна точная ширина в пикселях.
 * Без ResizeObserver (старый браузер, jsdom) — только начальный замер; 0 значит «не нарисовать».
 */
export function useElementWidth<T extends HTMLElement>(): [(node: T | null) => void, number] {
  const [width, setWidth] = useState(0)
  const observer = useRef<ResizeObserver | null>(null)

  const ref = useCallback((node: T | null) => {
    observer.current?.disconnect()
    observer.current = null
    if (!node) return
    setWidth(node.getBoundingClientRect().width)
    if (typeof ResizeObserver === 'undefined') return
    observer.current = new ResizeObserver(([entry]) => {
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.current.observe(node)
  }, [])

  useEffect(() => () => observer.current?.disconnect(), [])

  return [ref, width]
}

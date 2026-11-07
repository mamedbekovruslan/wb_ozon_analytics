import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ProductThumb } from '../index'

/*
 * Spec 008 «Страница «Остатки»», AC-25: заглушка-превью ProductThumb переезжает из pages/dashboard
 * в entities/product/ui и доступна через public API entities/product (нужна двум страницам).
 * Вид не меняется: декоративный квадрат с иконкой картинки, без текста и без img.
 * Размеры 36 (таблицы), 40 («Скоро закончится»), 44 (мобильные карточки) — вычисленные
 * значения проверяются в e2e (top-products, low-stock, stocks).
 */

const SIZES = [36, 40, 44] as const

function renderThumb(size: (typeof SIZES)[number]): HTMLElement {
  const { container } = render(<ProductThumb size={size} />)
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}

describe('ProductThumb в entities/product', () => {
  it.each(SIZES)('AC-25: size=%i — декоративный: aria-hidden, иконка svg, без текста и без img', (size) => {
    const thumb = renderThumb(size)
    expect(thumb).toHaveAttribute('aria-hidden', 'true')
    expect(thumb.querySelector('svg')).not.toBeNull()
    expect((thumb.textContent ?? '').trim()).toBe('')
    expect(thumb.querySelector('img')).toBeNull()
  })

  it('AC-25: размеры различаются оформлением (класс или inline-стиль)', () => {
    const looks = SIZES.map((s) => {
      const el = renderThumb(s)
      return `${el.className} | ${el.getAttribute('style') ?? ''}`
    })
    expect(new Set(looks).size).toBe(SIZES.length)
  })

  it('AC-25: иконка одна и та же во всех размерах', () => {
    const icons = SIZES.map((s) => renderThumb(s).querySelector('svg')?.innerHTML ?? '')
    expect(icons[0]).not.toBe('')
    expect(new Set(icons).size).toBe(1)
  })

  it('AC-25 / T3: не фокусируется и не ссылка', () => {
    const thumb = renderThumb(36)
    expect(thumb.querySelector('a, button, [tabindex]')).toBeNull()
    expect(thumb).not.toHaveAttribute('tabindex')
  })
})

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StockStatusBadge } from '../index'

/*
 * Spec 007 «Скоро закончится», AC-7: бейдж статуса запаса из public API entities/warehouse.
 *   <StockStatusBadge status="critical" /> — «Критично», треугольник, --danger на --danger-soft;
 *   <StockStatusBadge status="soon" />     — «Скоро закончится», часы, --warning на --warning-soft.
 * CSS-модули jsdom не применяет: размеры (20, padding 0 6px, радиус 4, 11/600, зазор 4, иконка 12)
 * и цвета сверяются с токенами в e2e/low-stock.spec.ts. Здесь — текст, иконка, доступность
 * и то, что оформление статусов различается.
 */

type Status = 'critical' | 'soon'

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

/** Корневой элемент бейджа — единственный ребёнок контейнера. */
function renderBadge(status: Status): HTMLElement {
  const { container } = render(<StockStatusBadge status={status} />)
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}

/** Всё, чем можно задать цвет без вычисленных стилей: классы и inline-стиль. */
const look = (el: HTMLElement) => `${el.className} | ${el.getAttribute('style') ?? ''}`

const LABEL: Record<Status, string> = { critical: 'Критично', soon: 'Скоро закончится' }
const TOKENS: Record<Status, [string, string]> = {
  critical: ['--danger', '--danger-soft'],
  soon: ['--warning', '--warning-soft'],
}

describe('StockStatusBadge', () => {
  it.each(['critical', 'soon'] as const)('AC-7: status="%s" — текст статуса', (status) => {
    expect(norm(renderBadge(status).textContent)).toBe(LABEL[status])
  })

  it.each(['critical', 'soon'] as const)('AC-7: status="%s" — одна иконка svg, скрытая от экранного диктора', (status) => {
    const badge = renderBadge(status)
    const svgs = [...badge.querySelectorAll('svg')]
    expect(svgs).toHaveLength(1)
    expect((svgs[0] as SVGElement).closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-7: у «Критично» и «Скоро закончится» разные иконки (треугольник и часы)', () => {
    const critical = renderBadge('critical').querySelector('svg')?.innerHTML ?? ''
    const soon = renderBadge('soon').querySelector('svg')?.innerHTML ?? ''
    expect(critical).not.toBe('')
    expect(soon).not.toBe('')
    expect(critical).not.toBe(soon)
  })

  it('AC-7: у статусов разное оформление (цвет задаётся классом или стилем)', () => {
    const critical = look(renderBadge('critical'))
    const soon = look(renderBadge('soon'))
    expect(critical.trim()).not.toBe('|')
    expect(critical).not.toBe(soon)
  })

  it('AC-7, AC-18: если цвета заданы inline-стилем — только токенами статуса', () => {
    for (const status of ['critical', 'soon'] as const) {
      const style = renderBadge(status).getAttribute('style') ?? ''
      if (!/color|background/i.test(style)) continue
      for (const token of TOKENS[status]) expect(style, status).toContain(token)
      expect(style, status).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
    }
  })

  it('AC-7: статус не передаётся одним цветом — текст виден, бейдж не скрыт и не sr-only', () => {
    for (const status of ['critical', 'soon'] as const) {
      const badge = renderBadge(status)
      expect(badge).not.toHaveAttribute('aria-hidden', 'true')
      expect(badge.closest('.sr-only')).toBeNull()
      // Текст — в разметке, а не только в aria-label
      const textNodes = [...badge.querySelectorAll('*'), badge].flatMap((el) =>
        [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && norm(n.textContent) !== ''),
      )
      expect(textNodes.map((n) => norm(n.textContent)).join(' '), status).toBe(LABEL[status])
    }
  })

  it('AC-7 / T3: бейдж — обычный текст, без ссылок, кнопок и фокуса', () => {
    for (const status of ['critical', 'soon'] as const) {
      const badge = renderBadge(status)
      expect(badge.querySelector('a, button, [tabindex]')).toBeNull()
      expect(badge).not.toHaveAttribute('tabindex')
      expect(badge).not.toHaveAttribute('role', 'button')
    }
  })
})

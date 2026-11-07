import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { StockStatusBadge } from '../index'

/*
 * Spec 008 «Страница «Остатки»», AC-15: бейдж статуса запаса поддерживает все четыре статуса
 * и размер size="md".
 *   ok      — «Норма», галочка, --success на --success-soft;
 *   noSales — «Нет продаж», перечёркнутый круг, --neutral на --neutral-soft;
 *   critical / soon — как в spec 007 (StockStatusBadge.test.tsx).
 *   size="md": 22, padding 0 8px 0 6px, 12/600, иконка 12, зазор 4; без size — прежние 20 / 11.
 * CSS-модули jsdom не применяет: размеры и цвета — в e2e/stocks.spec.ts. Здесь — текст, иконка,
 * доступность и то, что оформление различается (класс или inline-стиль).
 */

type Status = 'critical' | 'soon' | 'ok' | 'noSales'

const STATUSES: readonly Status[] = ['critical', 'soon', 'ok', 'noSales']
const LABEL: Record<Status, string> = {
  critical: 'Критично',
  soon: 'Скоро закончится',
  ok: 'Норма',
  noSales: 'Нет продаж',
}
const TOKENS: Record<Status, [string, string]> = {
  critical: ['--danger', '--danger-soft'],
  soon: ['--warning', '--warning-soft'],
  ok: ['--success', '--success-soft'],
  noSales: ['--neutral', '--neutral-soft'],
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim()

function renderBadge(status: Status, size?: 'md'): HTMLElement {
  const { container } = render(size ? <StockStatusBadge status={status} size={size} /> : <StockStatusBadge status={status} />)
  expect(container.children).toHaveLength(1)
  return container.firstElementChild as HTMLElement
}

const look = (el: HTMLElement) => `${el.className} | ${el.getAttribute('style') ?? ''}`
const iconOf = (el: HTMLElement) => el.querySelector('svg')?.innerHTML ?? ''

describe('StockStatusBadge — все статусы', () => {
  it.each(['ok', 'noSales'] as const)('AC-15: status="%s" — текст статуса', (status) => {
    expect(norm(renderBadge(status).textContent)).toBe(LABEL[status])
  })

  it.each(STATUSES)('AC-15: status="%s" — одна иконка svg, скрытая от экранного диктора', (status) => {
    const svgs = [...renderBadge(status).querySelectorAll('svg')]
    expect(svgs).toHaveLength(1)
    expect((svgs[0] as SVGElement).closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it('AC-15: у всех четырёх статусов разные иконки (треугольник, часы, галочка, перечёркнутый круг)', () => {
    const icons = STATUSES.map((s) => iconOf(renderBadge(s)))
    for (const icon of icons) expect(icon).not.toBe('')
    expect(new Set(icons).size).toBe(4)
  })

  it('AC-15: «Нет продаж» — перечёркнутый круг: в иконке есть окружность и линия', () => {
    const svg = renderBadge('noSales').querySelector('svg') as SVGElement
    const hasCircle = svg.querySelector('circle') !== null || /a\s*[\d.]/i.test(svg.innerHTML)
    expect(hasCircle).toBe(true)
    expect(svg.querySelectorAll('path, line, circle').length).toBeGreaterThanOrEqual(2)
  })

  it('AC-15: у всех четырёх статусов разное оформление', () => {
    const looks = STATUSES.map((s) => look(renderBadge(s)))
    for (const l of looks) expect(l.trim()).not.toBe('|')
    expect(new Set(looks).size).toBe(4)
  })

  it('AC-15, AC-27: если цвета заданы inline-стилем — только токенами статуса', () => {
    for (const status of STATUSES) {
      for (const size of [undefined, 'md'] as const) {
        const style = renderBadge(status, size).getAttribute('style') ?? ''
        if (!/color|background/i.test(style)) continue
        for (const token of TOKENS[status]) expect(style, status).toContain(token)
        expect(style, status).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i)
      }
    }
  })

  it('AC-15: статус не передаётся одним цветом — текст в разметке, бейдж не скрыт', () => {
    for (const status of ['ok', 'noSales'] as const) {
      const badge = renderBadge(status)
      expect(badge).not.toHaveAttribute('aria-hidden', 'true')
      expect(badge.closest('.sr-only')).toBeNull()
      const textNodes = [...badge.querySelectorAll('*'), badge].flatMap((el) =>
        [...el.childNodes].filter((n) => n.nodeType === Node.TEXT_NODE && norm(n.textContent) !== ''),
      )
      expect(textNodes.map((n) => norm(n.textContent)).join(' '), status).toBe(LABEL[status])
    }
  })

  it('AC-15 / T3: новые статусы — без ссылок, кнопок и фокуса', () => {
    for (const status of ['ok', 'noSales'] as const) {
      const badge = renderBadge(status, 'md')
      expect(badge.querySelector('a, button, [tabindex]')).toBeNull()
      expect(badge).not.toHaveAttribute('tabindex')
    }
  })
})

describe('StockStatusBadge — размер md', () => {
  it.each(STATUSES)('AC-15: size="md", status="%s" — тот же текст и та же иконка, что без size', (status) => {
    const base = renderBadge(status)
    const md = renderBadge(status, 'md')
    expect(norm(md.textContent)).toBe(LABEL[status])
    expect(iconOf(md)).toBe(iconOf(base))
    expect(md.querySelector('svg')?.closest('[aria-hidden="true"]')).not.toBeNull()
  })

  it.each(STATUSES)('AC-15: size="md", status="%s" — оформление отличается от размера по умолчанию', (status) => {
    expect(look(renderBadge(status, 'md'))).not.toBe(look(renderBadge(status)))
  })

  it('AC-15: без size — тот же вид, что при явном отсутствии размера (прежние 20 / 11 из spec 007)', () => {
    for (const status of STATUSES) {
      const { container } = render(<StockStatusBadge status={status} size={undefined} />)
      expect(look(container.firstElementChild as HTMLElement)).toBe(look(renderBadge(status)))
    }
  })
})

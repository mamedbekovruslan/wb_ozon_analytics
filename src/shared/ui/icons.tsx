// Иконки из макетов (Chrome.dc.html): контурные, цвет — currentColor, для скринридера скрыты.

type IconProps = { size?: number; className?: string }

const base = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.5,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const

export function CalendarIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <rect x="2.5" y="3.5" width="11" height="10" rx="1.5" />
      <path d="M2.5 6.5h11M5.5 2v3M10.5 2v3" />
    </svg>
  )
}

export function ChevronDownIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M4 6l4 4 4-4" />
    </svg>
  )
}

/** Стрелки бейджа изменения (Dashboard.dc.html, KPI) */
export function ArrowUpIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.8} width={size} height={size} className={className}>
      <path d="M8 13V3M4 7l4-4 4 4" />
    </svg>
  )
}

export function ArrowDownIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.8} width={size} height={size} className={className}>
      <path d="M8 3v10M4 9l4 4 4-4" />
    </svg>
  )
}

/** «Нет данных» (Dashboard.dc.html, состояние empty) */
export function InboxIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.4} width={size} height={size} className={className}>
      <path d="M2 9l2-6h8l2 6v4H2V9z" />
      <path d="M2 9h3.5l1 1.5h3l1-1.5H14" />
    </svg>
  )
}

/** Ошибка (Dashboard.dc.html, состояние error); 12 / 1.8 — бейдж «Критично» */
export function WarningIcon({ size = 20, strokeWidth = 1.4, className }: IconProps & { strokeWidth?: number }) {
  return (
    <svg {...base} strokeWidth={strokeWidth} width={size} height={size} className={className}>
      <path d="M8 2.5l6 11H2l6-11z" />
      <path d="M8 6.5v3M8 11.5v.01" />
    </svg>
  )
}

/** Бейдж «Скоро закончится» (Dashboard.dc.html, блок low-h) */
export function ClockIcon({ size = 12, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.8} width={size} height={size} className={className}>
      <circle cx="8" cy="8" r="6" />
      <path d="M8 5v3l2 1.5" />
    </svg>
  )
}

/** Ссылка «Все остатки» (Dashboard.dc.html, блок low-h) */
export function ArrowRightIcon({ size = 14, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  )
}

export function RefreshIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M13 8a5 5 0 11-1.5-3.5M13 2.5v3h-3" />
    </svg>
  )
}

/** 20 / 1.6 — «Ничего не заканчивается» (Dashboard.dc.html, блок low-h) */
export function CheckIcon({ size = 14, strokeWidth = 1.8, className }: IconProps & { strokeWidth?: number }) {
  return (
    <svg {...base} strokeWidth={strokeWidth} width={size} height={size} className={className}>
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  )
}

export function CloseIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  )
}

/** Двойная стрелка «сортировка» (Dashboard.dc.html, «Топ-10»): в заголовке таблицы — 12 × 1,6 */
export function SortIcon({ size = 16, strokeWidth = 1.5, className }: IconProps & { strokeWidth?: number }) {
  return (
    <svg {...base} strokeWidth={strokeWidth} width={size} height={size} className={className}>
      <path d="M5 6l3-3 3 3M5 10l3 3 3-3" />
    </svg>
  )
}

/** Заглушка фото товара (Dashboard.dc.html, превью в «Топ-10») */
export function ImageIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base} strokeWidth={1.3} width={size} height={size} className={className}>
      <rect x="2" y="3" width="12" height="10" rx="1.5" />
      <circle cx="6" cy="6.5" r="1.2" />
      <path d="M2.5 12l3.5-3.5 2.5 2.5 2-2 3 3" />
    </svg>
  )
}

export function FilterIcon({ size = 16, className }: IconProps) {
  return (
    <svg {...base} width={size} height={size} className={className}>
      <path d="M2.5 4.5h11M4.5 8h7M6.5 11.5h3" />
    </svg>
  )
}

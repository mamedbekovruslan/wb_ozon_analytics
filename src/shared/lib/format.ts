// Форматирование чисел и дат ru-RU — по разделу 6 ТЗ.
// Пробелы — неразрывные (U+00A0), минус — U+2212.

import { parseDay } from './day';

const NBSP = ' ';
const MINUS = '−';
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_GENITIVE = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря',
];

const intFmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 });
// Отличие от исходника дизайнера: Intl и toFixed дают дефис и «-0», а правило выше требует U+2212.
const minus = (s: string) => s.replace('-', MINUS);
const oneDigit = (n: number) => {
  const s = n.toFixed(1);
  return minus((s === '-0.0' ? '0.0' : s).replace('.', ','));
};
const nb = (s: string) => s.replace(/[\s ]/g, NBSP);

/** 1 234 567 */
export const formatInt = (n: number) => minus(nb(intFmt.format(Math.round(n) || 0)));

/** 1 234 567 ₽ */
export const formatRub = (n: number) => `${formatInt(n)}${NBSP}₽`;

/** Штуки на графике продаж: 5 476 шт (без склонения, как в макете) */
export const formatPieces = (n: number) => `${formatInt(n)}${NBSP}шт`;

/** KPI: 1,2 млн ₽ · 250 тыс. ₽ · 9 870 ₽ */
export const formatRubShort = (n: number) => {
  const a = Math.abs(n);
  // Отличие от исходника: от 999 500 ₽ тысячи округляются до 1000 — пишем «1,0 млн ₽», а не «1000 тыс. ₽» (spec 004, AC-20)
  if (a >= 1e6 || Math.round(a / 1e3) >= 1000) return `${oneDigit(n / 1e6)}${NBSP}млн${NBSP}₽`;
  if (a >= 1e4) return `${formatInt(n / 1e3)}${NBSP}тыс.${NBSP}₽`;
  return formatRub(n);
};

/** Подпись оси Y: 0 · 250 тыс. · 1,5 млн */
export const formatAxisMoney = (n: number) => {
  if (n === 0) return '0';
  if (Math.abs(n) >= 1e6) return `${oneDigit(n / 1e6).replace(/,0$/, '')}${NBSP}млн`;
  return `${formatInt(n / 1e3)}${NBSP}тыс.`;
};

/** 87,4 % */
export const formatPercent = (n: number) => `${oneDigit(n)}${NBSP}%`;

/** +12,4 % · −5,5 % · 0,0 % (отличие от исходника: у округлённого нуля нет знака, spec 004, AC-19) */
export const formatDelta = (n: number) => {
  const digits = oneDigit(Math.abs(n));
  if (digits === '0,0') return `0,0${NBSP}%`;
  return `${n >= 0 ? '+' : MINUS}${digits}${NBSP}%`;
};

/**
 * (текущее − прошлое) / |прошлое| × 100; null, если прошлое = 0.
 * Отличие от исходника — модуль: рост прибыли из минуса (−100 → 50) остаётся ростом (spec 004, AC-8).
 */
export const changePercent = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / Math.abs(prev)) * 100);

/** 04.11.2026 */
export const formatDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

/** Период из дней API `ГГГГ-ММ-ДД`: 05.10.2026 – 03.11.2026 */
export const formatRange = (from: string, to: string) => `${formatDate(parseDay(from))} – ${formatDate(parseDay(to))}`;

/** Период в тексте: 05.10–03.11.2026; если годы разные — 28.12.2025–03.01.2026 */
export const formatPeriodShort = (from: string, to: string) => {
  const start = parseDay(from);
  const end = parseDay(to);
  const head = start.getFullYear() === end.getFullYear() ? formatDayMonth(start) : formatDate(start);
  return `${head}–${formatDate(end)}`;
};

/** Короткий диапазон в мобильной сводке фильтров: 05.10 */
export const formatDayMonth = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;

/** 1 категория · 3 категории · 5 категорий */
export const formatCategoriesCount = (n: number) => {
  const mod10 = n % 10;
  const mod100 = n % 100;
  const word =
    mod10 === 1 && mod100 !== 11 ? 'категория' : mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14) ? 'категории' : 'категорий';
  return `${formatInt(n)}${NBSP}${word}`;
};

/** Ось графика: 4 нояб. */
export const formatAxisDate = (d: Date) => `${d.getDate()}${NBSP}${MONTHS_SHORT[d.getMonth()]}`;

/** Текст для скринридера из дня API `ГГГГ-ММ-ДД`: 5 октября · 5 октября 2026 */
export const formatDayMonthLong = (day: string, withYear = false) => {
  const d = parseDay(day);
  const head = `${d.getDate()}${NBSP}${MONTHS_GENITIVE[d.getMonth()]}`;
  return withYear ? `${head}${NBSP}${d.getFullYear()}` : head;
};

/** Тултип: ср, 28 окт. 2026 */
export const formatTooltipDate = (d: Date) =>
  `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()}${NBSP}${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;

// Целые дни запаса — одни и те же для показа и статуса (spec 007): иначе 14,5 дня
// показывались бы как «14 дн.» с бейджем «Норма». Допуск — чтобы 14 / (14 / 14)
// не превратилось из-за плавающей точки в 13,999… → «13 дн.».
const wholeStockDays = (stock: number, perDay: number) => Math.floor(stock / perDay + 1e-9);

/** Дни запаса: «3 дн.» или «—», если продаж нет */
export const formatStockDays = (stock: number, perDay: number) =>
  perDay > 0 ? `${formatInt(wholeStockDays(stock, perDay))}${NBSP}дн.` : '—';

/** Скорость продаж: 6,1/день */
export const formatSpeed = (n: number) => `${oneDigit(n)}/день`;

export type StockStatus = 'critical' | 'soon' | 'ok' | 'noSales';

/**
 * По целым дням, как показ: критично < 7 · скоро закончится 7–14 · норма ≥ 15 · нет продаж.
 * Отличие от исходника дизайнера (там — по точным дням), docs/design/deviations.md.
 */
export const stockStatus = (stock: number, perDay: number): StockStatus => {
  if (perDay <= 0) return 'noSales';
  const days = wholeStockDays(stock, perDay);
  if (days < 7) return 'critical';
  if (days <= 14) return 'soon';
  return 'ok';
};

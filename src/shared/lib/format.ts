// Форматирование чисел и дат ru-RU — по разделу 6 ТЗ.
// Пробелы — неразрывные (U+00A0), минус — U+2212.

const NBSP = ' ';
const MINUS = '−';
const MONTHS_SHORT = ['янв.', 'февр.', 'мар.', 'апр.', 'мая', 'июн.', 'июл.', 'авг.', 'сент.', 'окт.', 'нояб.', 'дек.'];
const WEEKDAYS_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];

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

/** KPI: 1,2 млн ₽ · 250 тыс. ₽ · 9 870 ₽ */
export const formatRubShort = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1e6) return `${oneDigit(n / 1e6)}${NBSP}млн${NBSP}₽`;
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

/** +12,4 % · −5,5 % */
export const formatDelta = (n: number) => `${n >= 0 ? '+' : MINUS}${oneDigit(Math.abs(n))}${NBSP}%`;

/** (текущее − прошлое) / прошлое × 100; null, если прошлое = 0 */
export const changePercent = (cur: number, prev: number) => (prev === 0 ? null : ((cur - prev) / prev) * 100);

/** 04.11.2026 */
export const formatDate = (d: Date) =>
  `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`;

/** Ось графика: 4 нояб. */
export const formatAxisDate = (d: Date) => `${d.getDate()}${NBSP}${MONTHS_SHORT[d.getMonth()]}`;

/** Тултип: ср, 28 окт. 2026 */
export const formatTooltipDate = (d: Date) =>
  `${WEEKDAYS_SHORT[d.getDay()]}, ${d.getDate()}${NBSP}${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;

/** Дни запаса: «3 дн.» или «—», если продаж нет */
export const formatStockDays = (stock: number, perDay: number) =>
  perDay > 0 ? `${Math.floor(stock / perDay)}${NBSP}дн.` : '—';

export type StockStatus = 'critical' | 'soon' | 'ok' | 'noSales';

/** критично < 7 · скоро закончится 7–14 · норма > 14 · нет продаж */
export const stockStatus = (stock: number, perDay: number): StockStatus => {
  if (perDay <= 0) return 'noSales';
  const days = stock / perDay;
  if (days < 7) return 'critical';
  if (days <= 14) return 'soon';
  return 'ok';
};

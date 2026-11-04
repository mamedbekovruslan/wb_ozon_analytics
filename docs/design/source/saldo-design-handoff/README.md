# Передача дизайна в Claude Code

## 1. Положите папку в репозиторий

```
your-app/
├── docs/design/            ← содержимое этого архива
│   ├── DESIGN_SPEC.md
│   ├── reference/*.dc.html
│   └── README.md
└── src/
    ├── styles/tokens.css   ← скопировать из src/styles/
    └── lib/format.ts       ← скопировать из src/lib/
```

Подключите токены один раз в точке входа (`main.tsx`): `import './styles/tokens.css'`, а шрифт — в `index.html`:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
```

## 2. Добавьте в CLAUDE.md проекта

```markdown
## Дизайн
- Спецификация: docs/design/DESIGN_SPEC.md — читать перед любой UI-задачей.
- Макеты-референсы: docs/design/reference/*.dc.html (точные размеры, тексты, состояния; это не код для копирования).
- Токены: src/styles/tokens.css. В CSS Modules — только var(--…), никаких хексов и px вне шкалы 4 px.
- Тема: атрибут data-theme="light|dark" на <html>, сохраняется в localStorage, по умолчанию — prefers-color-scheme.
- Форматирование чисел и дат — только через src/lib/format.ts.
- Без UI-библиотек; графики — Recharts, isAnimationActive={false}; анимации ≤ 200 мс.
- Каждый блок данных имеет 4 состояния: loading (скелетон), empty, error, data.
```

## 3. Промпты для Claude Code — по одному шагу

Лучше идти маленькими шагами и проверять каждый в браузере.

1. **Основа**
   > Прочитай docs/design/DESIGN_SPEC.md и docs/design/reference/Main.dc.html, Components.dc.html. Подключи tokens.css и шрифт, сделай ThemeProvider (data-theme на html, localStorage, prefers-color-scheme) и базовые компоненты в src/components/ui: Button (primary/secondary/ghost/icon, size m/l, loading), Badge (marketplace, fbo/fbs, orderStatus, stockStatus, delta), Skeleton, BlockState (empty/error). CSS Modules, только токены. Покажи их на временной странице /ui.

2. **Каркас и фильтры**
   > По reference/Chrome.dc.html и разделу 3 спеки сделай AppShell: Header, FiltersBar (период, сравнение, маркетплейс, категории, сброс), DateRangePicker, MobileFiltersSheet, BottomTabs. Состояние фильтров — в URL search params + контекст. Брейкпоинты 640 / 1200.

3. **Дашборд**
   > По reference/Dashboard.dc.html: KpiCard (+ инверсия для возвратов), SalesChart на Recharts (стопка WB/Ozon, пунктир прошлого периода, кастомный тултип, переключатель метрики), LowStockList, TopProductsTable с сортировкой и мобильными карточками. У каждого блока 4 состояния. Формулы метрик — из глоссария.

4. **Заказы**
   > По reference/Orders.dc.html: таблица на 100 000 строк с собственной виртуальной прокруткой (фиксированная высота строки, без библиотек), поиск с дебаунсом, чипы статусов, счётчик «Найдено». На телефоне — карточки.

5. **Остатки**
   > По reference/Stock.dc.html: плитки статусов-фильтры, таблица товар × склад с полосой дней запаса, FBO/FBS у Ozon, мобильные карточки. Статус и дни — через stockStatus/formatStockDays из format.ts.

6. **Проверка**
   > Пройди все экраны на 1440, 768, 375 в обеих темах и во всех состояниях; проверь контраст, фокус с клавиатуры и размер касания ≥ 44 px. Сравни с референсами и перечисли расхождения.

## 4. Совет

Если в Claude Code есть Playwright или MCP браузера, попросите его открывать `reference/*.dc.html` и свою страницу рядом и сравнивать скриншоты — так расхождения находятся быстрее. Сами `.dc.html` вне холста отрисуются без рантайма, поэтому для агента они прежде всего источник разметки, стилей и данных.

# Roadmap

Статус проекта. Обновляется после каждой закрытой задачи. Новый чат начинается с чтения этого файла и [AGENTS.md](../AGENTS.md).

**Текущий этап:** 1 — инфраструктура.
**Следующий шаг:** порция `chore/e2e` (Testing Library, jsdom, Playwright). Recharts и TanStack Table/Virtual ставятся вместе с фичами, где нужны.

## Этап 0. Каркас AI-документации
- [x] `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `.gitattributes`, `.gitignore`, roadmap
- [x] ADR 0000–0012
- [x] `docs/specs/_шаблон.md`, `docs/domain.md`, `docs/security.md`, `docs/design/brief.md`
- [x] skills: `new-feature`, `new-adr`, `add-rule`, `security-check`
- [x] субагенты: `qa`, `reviewer`
- [x] новый `README.md`
- [x] слияние ветки `docs/ai-foundation` в `main`

## Этап 1. Инфраструктура
- [x] дизайн получен и сохранён в `docs/design/source/` (правило 6)
- [x] перенести токены и форматтеры дизайна в `src/shared/` (+ тесты форматтеров), темы light/dark (начальная тема из `localStorage` / системы; переключатель — фича theme-toggle)
- [x] шрифт Inter локально через `@fontsource/inter` ([ADR-0013](adr/0013-шрифт-inter-локально.md)); отличия от исходников — [design/deviations.md](design/deviations.md)
- [x] Vitest, `npm test`
- [x] TanStack Router + zod, TanStack Query, каркас MSW 3, `apiGet` с zod-проверкой ответа (+ тесты), запрет импорта `mocks/` в oxlint
- [ ] TanStack Table/Virtual — вместе с фичей «Страница заказов»
- [x] папки слоёв FSD, steiger (`npm run lint:fsd`)
- [x] правило 7: проверки агент запускает сам, при падении — стоп и вопрос пользователю
- [ ] Vitest + Testing Library, Playwright
- [ ] с объяснением и согласием: GitHub-репозиторий, GitHub Actions, gitleaks, Dependabot, Vercel

## Этап 2. Фичи
1. [ ] Сверка API WB/Ozon + генератор + адаптеры + MSW API
2. [ ] Фильтры в URL
3. [ ] KPI-карточки
4. [ ] График продаж по дням
5. [ ] Топ товаров
6. [ ] Остатки и «скоро закончится»
7. [ ] Страница заказов (виртуализация)
7a. [ ] Страница 404 (маршрут `*`, по `NotFound.dc.html`; после шапки и API заказов/остатков)
8. [ ] Экспорт в Excel
9. [ ] Применение дизайна, мобильная версия, темы, a11y

## Открытые вопросы
- ~~Дизайн: ждём макеты и токены от ИИ-дизайнера.~~ Получены — [docs/design/source/saldo-design-handoff/](design/source/saldo-design-handoff/DESIGN_SPEC.md).
- Название продукта: «Сальдо» — заглушка дизайнера, оставить или заменить.
- Временные `/api/health` (`mocks/handlers.ts`, `shared/api/health.ts`) и проверка на странице dashboard — удалить вместе с появлением генератора и настоящих эндпоинтов (фича 1).
- Страница 404: макет есть (`reference/NotFound.dc.html`), но нужны шапка и данные для подсказок — делается фичей 7a; пока стандартная английская от TanStack Router. Нужен email поддержки вместо `[EMAIL ПОДДЕРЖКИ]` или решение убрать строку. Страницы ошибки роутера в макетах нет — решить там же.
- Редирект `/` → `/dashboard` теряет search-параметры — учесть в фиче «Фильтры в URL».
- `apiGet`: сетевая ошибка (`TypeError: Failed to fetch`) сейчас пробрасывается как есть, а не как `ApiError` — решить при первой фиче с данными (вопрос qa от 2026-11-04).
- Vercel: нужен `vercel.json` с перенаправлением всех путей на `index.html` (иначе прямой заход на `/dashboard` даст 404) и CSP из `docs/security.md` — на шаге подключения Vercel.
- Форматтеры (решить в spec KPI-панели): `formatDelta(-0.04)` даёт «−0,0 %»; 999 500 ₽ в KPI — «1000 тыс. ₽» вместо «1,0 млн ₽»; округлять ли статус запаса по целым дням (вопросы qa от 2026-11-04).

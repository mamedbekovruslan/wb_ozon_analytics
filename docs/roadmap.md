# Roadmap

Статус проекта. Обновляется после каждой закрытой задачи. Новый чат начинается с чтения этого файла и [AGENTS.md](../AGENTS.md).

**Текущий этап:** 2 — фичи (этап 1 закрыт, кроме пунктов, которые ставятся вместе с фичами).
**Следующий шаг:** фича 2 «Фильтры в URL» через skill `new-feature`; затем 2a «Генерация в фоне (Web Worker)» — до KPI-карточек. Recharts и TanStack Table/Virtual ставятся вместе с фичами, где нужны.

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
- [x] Vitest + Testing Library + jsdom, Playwright (`npm run test:e2e`, Chromium, 1440 и 375 px), дымовые тесты; `@axe-core/playwright` — вместе с пунктом 9 (a11y)
- [x] публичный GitHub-репозиторий: [mamedbekovruslan/wb_ozon_analytics](https://github.com/mamedbekovruslan/wb_ozon_analytics)
- [x] GitHub Actions: `.github/workflows/ci.yml` — lint, steiger, unit-тесты, сборка, e2e на push в `main` и на каждый PR
- [x] gitleaks в CI: job `secrets` — поиск секретов по всей истории git
- [x] Dependabot: `.github/dependabot.yml` — npm, GitHub Actions и образ gitleaks (docker), раз в неделю
- [x] Dependabot alerts и Dependabot security updates включены в настройках репозитория
- [x] actions закреплены по SHA, образ gitleaks — по дайджесту в `.github/gitleaks/Dockerfile` (Dependabot обновляет оба)
- [x] защита ветки `main` (classic branch protection, [ADR-0014](adr/0014-github-flow-с-защитой-main.md)): только через PR, без обязательного одобрения; обязательные проверки — все три job CI (gitleaks, линтеры/unit/сборка, E2E), ветка PR должна быть актуальной; обход запрещён и для администратора; force push и удаление запрещены
- [x] Vercel: продакшен https://wb-ozon-analytics.vercel.app/ (деплой при слиянии в `main`), превью на каждый PR; Node 24; `vercel.json` — перенаправление на `index.html` и заголовки безопасности из `docs/security.md`

## Этап 2. Фичи
1. [x] Сверка API WB/Ozon + генератор + адаптеры + MSW API — [spec 001](specs/001-фейковый-api.md), сверка в [domain/wb-api.md](domain/wb-api.md) и [domain/ozon-api.md](domain/ozon-api.md); эндпоинты `/api/meta`, `/api/kpi`, `/api/sales-daily`, `/api/top-products`, `/api/stocks`, `/api/orders`; zod-схемы ответов в `entities/{marketplace,sale,product,warehouse}`
2. [ ] Фильтры в URL
2a. [ ] Генерация данных в фоне (Web Worker): первая генерация блокирует вкладку ~2,7 с (замер в [spec 001](specs/001-фейковый-api.md), «Замеры»; ADR-0004). Свой ADR, spec и тесты; сделать до KPI-карточек
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
- ~~Временные `/api/health` … — удалить вместе с появлением генератора и настоящих эндпоинтов (фича 1).~~ Сделано в фиче 1: проверка идёт через `/api/meta`. Временная страница dashboard и её дымовые тесты переписываются в фиче KPI.
- Страница 404: макет есть (`reference/NotFound.dc.html`), но нужны шапка и данные для подсказок — делается фичей 7a; пока стандартная английская от TanStack Router. Нужен email поддержки вместо `[EMAIL ПОДДЕРЖКИ]` или решение убрать строку. Страницы ошибки роутера в макетах нет — решить там же.
- Редирект `/` → `/dashboard` теряет search-параметры — учесть в фиче «Фильтры в URL».
- ~~`apiGet`: сетевая ошибка пробрасывается как есть, а не как `ApiError`.~~ Сделано в фиче 1 (AC-27).
- steiger: правило `fsd/insignificant-slice` для `src/entities/**` временно понижено до предупреждения (схемы ответов API есть, а виджетов ещё нет) — вернуть ошибку в фиче KPI-карточек (`steiger.config.ts`).
- ~~Vercel: нужен `vercel.json` с перенаправлением всех путей на `index.html` и CSP.~~ Сделано.
- Форматтеры (решить в spec KPI-панели): `formatDelta(-0.04)` даёт «−0,0 %»; 999 500 ₽ в KPI — «1000 тыс. ₽» вместо «1,0 млн ₽»; округлять ли статус запаса по целым дням (вопросы qa от 2026-11-04).

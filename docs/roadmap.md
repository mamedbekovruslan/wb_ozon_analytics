# Roadmap

Статус проекта. Обновляется после каждой закрытой задачи. Новый чат начинается с чтения этого файла и [AGENTS.md](../AGENTS.md).

**Текущий этап:** 1 — инфраструктура.
**Следующий шаг:** порция `chore/data-layer` (Router, zod, Query, каркас MSW; запрет импортов из `mocks/` в oxlint, кроме `app/`; проверить, что steiger игнорирует `mocks/`). Дальше `chore/e2e` (Testing Library, jsdom, Playwright). Recharts и TanStack Table/Virtual ставятся вместе с фичами, где нужны.

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
- [ ] TanStack Router + zod, TanStack Query, MSW, TanStack Table/Virtual
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
8. [ ] Экспорт в Excel
9. [ ] Применение дизайна, мобильная версия, темы, a11y

## Открытые вопросы
- ~~Дизайн: ждём макеты и токены от ИИ-дизайнера.~~ Получены — [docs/design/source/saldo-design-handoff/](design/source/saldo-design-handoff/DESIGN_SPEC.md).
- Название продукта: «Сальдо» — заглушка дизайнера, оставить или заменить.
- Форматтеры (решить в spec KPI-панели): `formatDelta(-0.04)` даёт «−0,0 %»; 999 500 ₽ в KPI — «1000 тыс. ₽» вместо «1,0 млн ₽»; округлять ли статус запаса по целым дням (вопросы qa от 2026-11-04).

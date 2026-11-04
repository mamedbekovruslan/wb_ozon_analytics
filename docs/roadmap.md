# Roadmap

Статус проекта. Обновляется после каждой закрытой задачи. Новый чат начинается с чтения этого файла и [AGENTS.md](../AGENTS.md).

**Текущий этап:** 1 — инфраструктура.
**Следующий шаг:** этап 1 в новом чате. Начать с объяснения пользователю, какие пакеты ставим и зачем (правило 1 и skill `new-adr`).

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
- [ ] перенести токены и форматтеры дизайна в `src/shared/` (+ тесты форматтеров), темы light/dark
- [ ] решить, как подключать шрифт Inter: Google Fonts или локально (ADR)
- [ ] TanStack Router + zod, TanStack Query, MSW, TanStack Table/Virtual
- [ ] steiger, Vitest + Testing Library, Playwright
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

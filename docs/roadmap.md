# Roadmap

Статус проекта. Обновляется после каждой закрытой задачи. Новый чат начинается с чтения этого файла и [AGENTS.md](../AGENTS.md).

**Текущий этап:** 0 — каркас AI-документации.
**Следующий шаг:** новый `README.md`.

## Этап 0. Каркас AI-документации
- [x] `AGENTS.md`, `CLAUDE.md`, `.claude/settings.json`, `.gitattributes`, `.gitignore`, roadmap
- [x] ADR 0000–0012
- [x] `docs/specs/_шаблон.md`, `docs/domain.md`, `docs/security.md`, `docs/design/brief.md`
- [x] skills: `new-feature`, `new-adr`, `add-rule`, `security-check`
- [x] субагенты: `qa`, `reviewer`
- [ ] новый `README.md`

## Этап 1. Инфраструктура
- [ ] временные дизайн-токены и темы
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
- Дизайн: ТЗ готово ([docs/design/brief.md](design/brief.md)), ждём макеты и токены от ИИ-дизайнера.

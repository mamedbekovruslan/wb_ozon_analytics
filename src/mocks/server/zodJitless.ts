import { z } from 'zod'

// То же, что src/app/zodJitless.ts, но для воркера фейкового API: у воркера
// своя копия zod, а mocks/ не зависит от слоёв приложения (ADR-0004).
// Без jitless zod пробует `new Function`, и CSP записывает нарушение.
// Настройка читается при создании схемы — модуль импортируется первым.
z.config({ jitless: true })

// Первым: до создания любых zod-схем (см. комментарий в модуле)
import './zodJitless'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '../shared/styles'
import { initTheme } from './initTheme'
import { App } from './App'
import { enableMocking } from './enableMocking'

initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Не найден элемент #root в index.html')

// Рендерим после старта MSW, иначе первые запросы уйдут мимо фейкового backend.
// Если MSW не запустился, приложение всё равно открывается и показывает ошибки загрузки.
enableMocking()
  .catch((error: unknown) => console.error('Не удалось запустить фейковый backend (MSW)', error))
  .finally(() => {
    createRoot(root).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })

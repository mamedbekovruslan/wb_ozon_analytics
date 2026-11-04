import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/inter/400.css'
import '@fontsource/inter/500.css'
import '@fontsource/inter/600.css'
import '../shared/styles/tokens.css'
import { initTheme } from './initTheme'
import { App } from './App'

initTheme()

const root = document.getElementById('root')
if (!root) throw new Error('Не найден элемент #root в index.html')

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

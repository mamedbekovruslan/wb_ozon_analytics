// Тема ставится до первого рендера, чтобы не было вспышки светлой темы у тех, кто выбрал тёмную.
// Переключатель появится в фиче theme-toggle и будет писать в тот же ключ.
const STORAGE_KEY = 'theme'

type Theme = 'light' | 'dark'

const isTheme = (value: unknown): value is Theme => value === 'light' || value === 'dark'

const readSavedTheme = (): Theme | null => {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return isTheme(value) ? value : null
  } catch {
    // localStorage недоступен (приватный режим, запрет cookies) — берём системную тему
    return null
  }
}

export const initTheme = () => {
  const systemTheme: Theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  document.documentElement.dataset.theme = readSavedTheme() ?? systemTheme
}

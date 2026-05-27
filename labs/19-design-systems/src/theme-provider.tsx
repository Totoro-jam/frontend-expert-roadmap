// ThemeProvider:支持 light/dark/system + SSR 防 FOUC + localStorage 持久化
// next-themes 的核心机制,自己实现一遍

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react'

type Theme = 'light' | 'dark' | 'system'
type ResolvedTheme = 'light' | 'dark'

interface Ctx {
  theme: Theme                      // 用户选择(可能是 system)
  resolvedTheme: ResolvedTheme      // 实际生效(system 解析后)
  setTheme: (t: Theme) => void
  themes: Theme[]
}

const ThemeCtx = createContext<Ctx | null>(null)

const STORAGE_KEY = 'theme'

// =====================================================
// 1. inline script:在 React 加载前同步设置 data-theme,防闪
// =====================================================
export const themeScript = `
(function() {
  try {
    var t = localStorage.getItem('${STORAGE_KEY}') || 'system'
    var resolved = t === 'system'
      ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      : t
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved
  } catch {}
})()
`

// 用法:在 Next.js _document.tsx 或 index.html 顶部塞入
// <script dangerouslySetInnerHTML={{ __html: themeScript }} />

// =====================================================
// 2. Provider
// =====================================================
interface ProviderProps {
  defaultTheme?: Theme
  children: ReactNode
}

export function ThemeProvider({ defaultTheme = 'system', children }: ProviderProps) {
  const [theme, setThemeState] = useState<Theme>(defaultTheme)
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('light')

  // 初始化:从 localStorage 读
  useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? defaultTheme
    setThemeState(stored)
  }, [defaultTheme])

  // 解析 system + 监听系统切换
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')

    function compute(t: Theme): ResolvedTheme {
      return t === 'system' ? (mq.matches ? 'dark' : 'light') : t
    }

    const resolved = compute(theme)
    setResolvedTheme(resolved)
    document.documentElement.dataset.theme = resolved
    document.documentElement.style.colorScheme = resolved

    // 选 system 时:监听系统变化
    if (theme === 'system') {
      const onChange = () => {
        const r = compute('system')
        setResolvedTheme(r)
        document.documentElement.dataset.theme = r
        document.documentElement.style.colorScheme = r
      }
      mq.addEventListener('change', onChange)
      return () => mq.removeEventListener('change', onChange)
    }
  }, [theme])

  // 跨标签同步
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === STORAGE_KEY && e.newValue) {
        setThemeState(e.newValue as Theme)
      }
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem(STORAGE_KEY, t)
  }, [])

  const value = useMemo<Ctx>(() => ({
    theme, resolvedTheme, setTheme, themes: ['light', 'dark', 'system'],
  }), [theme, resolvedTheme, setTheme])

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>
}

export function useTheme() {
  const v = useContext(ThemeCtx)
  if (!v) throw new Error('useTheme must be used within ThemeProvider')
  return v
}

// =====================================================
// 3. ThemeSwitcher 组件
// =====================================================
export function ThemeSwitcher() {
  const { theme, setTheme, themes } = useTheme()

  return (
    <select value={theme} onChange={e => setTheme(e.target.value as Theme)}>
      {themes.map(t => (
        <option key={t} value={t}>{t}</option>
      ))}
    </select>
  )
}

// =====================================================
// 4. View Transitions:Chrome 111+ 主题切换丝滑动画
// =====================================================
export async function setThemeWithTransition(setter: () => void) {
  if (!('startViewTransition' in document)) {
    setter()
    return
  }
  // @ts-ignore 实验 API
  await document.startViewTransition(setter).finished
}

// CSS 配合:
// ::view-transition-old(root), ::view-transition-new(root) {
//   animation-duration: 0.4s;
// }
// 或带圆形展开:
// @keyframes reveal {
//   from { clip-path: circle(0% at top right); }
//   to   { clip-path: circle(150% at top right); }
// }

// =====================================================
// 5. 用法
// =====================================================
/*
// app 根
<ThemeProvider defaultTheme="system">
  <App />
</ThemeProvider>

// 任何组件
function Header() {
  const { resolvedTheme, setTheme } = useTheme()
  return (
    <button onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}>
      {resolvedTheme === 'dark' ? '☀️' : '🌙'}
    </button>
  )
}

// SSR:Next.js _document.tsx
<Head>
  <script dangerouslySetInnerHTML={{ __html: themeScript }} />
</Head>
*/

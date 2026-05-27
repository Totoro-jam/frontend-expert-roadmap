// Compound Components 完整实现:Tabs
// 包含:Context 共享 state、键盘导航、a11y、受控/非受控、自动 focus 管理

import {
  createContext,
  useContext,
  useId,
  useRef,
  useCallback,
  type ReactNode,
  type KeyboardEvent,
} from 'react'
import { useControllableState } from './use-controllable'

// ========== Context ==========
interface TabsCtx {
  value: string
  setValue: (v: string) => void
  baseId: string
  registerTab: (value: string, el: HTMLButtonElement | null) => void
  focusTab: (direction: 'next' | 'prev' | 'first' | 'last') => void
}

const Ctx = createContext<TabsCtx | null>(null)

function useTabsCtx() {
  const v = useContext(Ctx)
  if (!v) throw new Error('Tabs.* must be used inside <Tabs>')
  return v
}

// ========== Root ==========
interface TabsProps {
  value?: string
  defaultValue?: string
  onValueChange?: (v: string) => void
  children: ReactNode
}

export function Tabs({ value, defaultValue, onValueChange, children }: TabsProps) {
  const [current, setCurrent] = useControllableState({
    value,
    defaultValue: defaultValue ?? '',
    onChange: onValueChange,
  })
  const baseId = useId()
  const triggers = useRef(new Map<string, HTMLButtonElement>())

  const registerTab = useCallback((v: string, el: HTMLButtonElement | null) => {
    if (el) triggers.current.set(v, el)
    else triggers.current.delete(v)
  }, [])

  const focusTab = useCallback((dir: 'next' | 'prev' | 'first' | 'last') => {
    const entries = Array.from(triggers.current.entries())
    if (entries.length === 0) return
    const idx = entries.findIndex(([v]) => v === current)
    let nextIdx = idx
    if (dir === 'next') nextIdx = (idx + 1) % entries.length
    if (dir === 'prev') nextIdx = (idx - 1 + entries.length) % entries.length
    if (dir === 'first') nextIdx = 0
    if (dir === 'last') nextIdx = entries.length - 1
    const [nextValue, el] = entries[nextIdx]
    setCurrent(nextValue)
    el?.focus()
  }, [current, setCurrent])

  return (
    <Ctx.Provider value={{ value: current, setValue: setCurrent, baseId, registerTab, focusTab }}>
      {children}
    </Ctx.Provider>
  )
}

// ========== List(role="tablist")==========
Tabs.List = function TabsList({ children, ...rest }: { children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div role="tablist" {...rest}>
      {children}
    </div>
  )
}

// ========== Trigger(role="tab")==========
interface TriggerProps {
  value: string
  children: ReactNode
}

Tabs.Trigger = function TabsTrigger({ value, children }: TriggerProps) {
  const ctx = useTabsCtx()
  const selected = ctx.value === value
  const ref = useRef<HTMLButtonElement>(null)

  // 注册到 list,用于键盘导航
  const setRef = useCallback((el: HTMLButtonElement | null) => {
    ;(ref as any).current = el
    ctx.registerTab(value, el)
  }, [ctx, value])

  function onKeyDown(e: KeyboardEvent<HTMLButtonElement>) {
    switch (e.key) {
      case 'ArrowRight': e.preventDefault(); ctx.focusTab('next'); break
      case 'ArrowLeft':  e.preventDefault(); ctx.focusTab('prev'); break
      case 'Home':       e.preventDefault(); ctx.focusTab('first'); break
      case 'End':        e.preventDefault(); ctx.focusTab('last'); break
    }
  }

  return (
    <button
      ref={setRef}
      role="tab"
      type="button"
      aria-selected={selected}
      aria-controls={`${ctx.baseId}-panel-${value}`}
      id={`${ctx.baseId}-trigger-${value}`}
      tabIndex={selected ? 0 : -1}    // roving tabindex 模式
      onClick={() => ctx.setValue(value)}
      onKeyDown={onKeyDown}
    >
      {children}
    </button>
  )
}

// ========== Content(role="tabpanel")==========
interface ContentProps {
  value: string
  children: ReactNode
  /** keep mounted hidden(SEO/性能/状态保留),默认隐藏卸载 */
  forceMount?: boolean
}

Tabs.Content = function TabsContent({ value, children, forceMount }: ContentProps) {
  const ctx = useTabsCtx()
  const active = ctx.value === value

  if (!active && !forceMount) return null

  return (
    <div
      role="tabpanel"
      hidden={!active}
      id={`${ctx.baseId}-panel-${value}`}
      aria-labelledby={`${ctx.baseId}-trigger-${value}`}
      tabIndex={0}
    >
      {children}
    </div>
  )
}

// =====================================================
// 用法
// =====================================================
/*
<Tabs defaultValue="overview">
  <Tabs.List>
    <Tabs.Trigger value="overview">Overview</Tabs.Trigger>
    <Tabs.Trigger value="analytics">Analytics</Tabs.Trigger>
    <Tabs.Trigger value="reports">Reports</Tabs.Trigger>
  </Tabs.List>

  <Tabs.Content value="overview"><Dashboard /></Tabs.Content>
  <Tabs.Content value="analytics"><Charts /></Tabs.Content>
  <Tabs.Content value="reports" forceMount><Reports /></Tabs.Content>
</Tabs>

// 受控
const [tab, setTab] = useState('overview')
<Tabs value={tab} onValueChange={setTab}>...</Tabs>
*/

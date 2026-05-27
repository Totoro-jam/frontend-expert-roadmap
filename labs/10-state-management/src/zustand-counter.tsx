// Zustand:最简洁的现代 store
// 5 个真实场景:基础 / persist / devtools / immer / selector

import { create } from 'zustand'
import { persist, devtools } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

// ====================================================
// 1. 基础
// ====================================================
interface CounterState {
  count: number
  inc: () => void
  reset: () => void
}

export const useCounter = create<CounterState>((set, get) => ({
  count: 0,
  inc: () => set(s => ({ count: s.count + 1 })),
  reset: () => set({ count: 0 }),
}))

// 用法:
// const count = useCounter(s => s.count)        // 只订阅 count 变化
// const inc = useCounter(s => s.inc)            // action 引用稳定,不会触发 re-render

// ====================================================
// 2. persist:localStorage 自动持久化
// ====================================================
export const usePrefs = create(persist<{ theme: string; setTheme: (t: string) => void }>(
  (set) => ({
    theme: 'light',
    setTheme: (t) => set({ theme: t }),
  }),
  { name: 'app-prefs' }   // localStorage key
))

// ====================================================
// 3. devtools:Redux DevTools 支持
// ====================================================
export const useUser = create(devtools<{ name: string; setName: (n: string) => void }>(
  (set) => ({
    name: '',
    setName: (n) => set({ name: n }, false, 'user/setName'),   // 第三参 = action 名
  }),
  { name: 'user-store' }
))

// ====================================================
// 4. immer:复杂嵌套状态
// ====================================================
interface CartState {
  items: { id: string; qty: number }[]
  add: (id: string) => void
  remove: (id: string) => void
}

export const useCart = create(immer<CartState>((set) => ({
  items: [],
  add: (id) => set(state => {
    const existing = state.items.find(i => i.id === id)
    if (existing) existing.qty++
    else state.items.push({ id, qty: 1 })
  }),
  remove: (id) => set(state => {
    state.items = state.items.filter(i => i.id !== id)
  }),
})))

// ====================================================
// 5. Selector + shallow 比较(避免无关字段变也 re-render)
// ====================================================
import { useShallow } from 'zustand/react/shallow'

function CartIcon() {
  // 默认 Object.is 比较:只要 items 数组引用变就 re-render
  // 但我们只想看 items.length,这样不必要
  const length = useCart(s => s.items.length)   // 长度变化才 re-render

  // 多字段订阅:
  // const { add, remove } = useCart(useShallow(s => ({ add: s.add, remove: s.remove })))

  return <span>🛒 {length}</span>
}

// ====================================================
// Zustand vs Redux Toolkit
// ====================================================
//
// 同样的 todo store:
//
//   Zustand:     ~20 行(store + selector + action)
//   RTK:         ~50 行(slice + selector + dispatch + Provider)
//
// 但 RTK 在企业级有优势:
//   - 严格的 action 命名规范(便于团队协作)
//   - 完整的 time-travel debug
//   - RTK Query 数据获取一体化
//   - 大型项目 reducer 拆分清晰
//
// 选型:小到中型用 Zustand,大型企业用 RTK,跨平台/跨框架优先 Zustand(vanilla 模式)

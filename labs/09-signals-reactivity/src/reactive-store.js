// 100 行实现 Zustand-like reactive store
// Zustand / Jotai / Valtio / 都是这个模式的变种

// ====================================================
// 基础 store
// ====================================================
export function createStore(initial) {
  let state = typeof initial === 'function' ? initial(setState, getState) : initial
  const listeners = new Set()

  function getState() { return state }

  function setState(updater, replace = false) {
    const next = typeof updater === 'function' ? updater(state) : updater
    if (Object.is(next, state)) return
    state = replace ? next : { ...state, ...next }
    listeners.forEach(l => l(state))
  }

  function subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { getState, setState, subscribe }
}

// ====================================================
// 高级:selector + 浅比较(避免无关字段变也通知)
// ====================================================
export function subscribeWithSelector(store, selector, listener, equalityFn = Object.is) {
  let prev = selector(store.getState())
  return store.subscribe((state) => {
    const next = selector(state)
    if (!equalityFn(prev, next)) {
      const old = prev
      prev = next
      listener(next, old)
    }
  })
}

// ====================================================
// React 接入(简化 useStore)
// ====================================================
/*
  import { useSyncExternalStore } from 'react'

  function useStore(store, selector = s => s) {
    return useSyncExternalStore(
      store.subscribe,
      () => selector(store.getState()),
      () => selector(store.getState())   // SSR
    )
  }
*/

// ====================================================
// 用法演示
// ====================================================
/*
  const useCounter = createStore((set, get) => ({
    count: 0,
    inc: () => set({ count: get().count + 1 }),
    reset: () => set({ count: 0 }),
  }))

  // React 里:
  function Counter() {
    const count = useStore(useCounter, s => s.count)    // ✅ 只有 count 变才 re-render
    const inc = useStore(useCounter, s => s.inc)
    return <button onClick={inc}>{count}</button>
  }
*/

// ====================================================
// 为什么这个模式取代了 Redux?
// ====================================================
//
// Redux 时代:
//   - 必须写 action / reducer / dispatch(模板代码多)
//   - 全局 store,组件订阅需要 connect HOC / useSelector
//
// Zustand 哲学:
//   - store 就是一个 hook,直接调用
//   - action 就是 store 上的方法(set + get 闭包)
//   - selector + 浅比较实现「按需 re-render」
//   - 零模板代码
//
// Jotai 走另一条路:atom 化(像 Recoil),细粒度
// Valtio:Proxy-based,直接改对象就触发更新
// Redux Toolkit:Redux + Immer + 现代化 API,大型项目仍然首选
//
// 详见 [10-state-management-lab](../../10-state-management-lab/)
